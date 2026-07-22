import logging
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth import login, logout
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import redirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.services import write_audit_log
from apps.core.middleware import get_endpoint_template
from apps.accounts.models import (
    AgencyInvitation,
    AgencyMembership,
    AgencyProfile,
    CleanerProfile,
    CookieConsent,
    HostProfile,
    SignupEmailVerification,
)
from apps.accounts.permissions import IsPlatformAdmin
from apps.accounts.services import (
    AccountDeletionBlocked,
    AccountTransitionError,
    delete_account_permanently,
    ensure_agency_can_invite,
    ensure_invitation_can_be_accepted,
    reconcile_contact_verification,
    reject_account,
    suspend_account,
)
from apps.accounts.tokens import email_verification_token
from apps.notifications.services import NotificationEventRequest, emit_notification_event
from apps.notifications.tasks import send_admin_new_account_email, send_signup_email_code
from apps.core.logging import get_request_id
from apps.accounts.serializers import (
    AccountTransitionSerializer,
    AdminUserSerializer,
    AgencyInvitationSerializer,
    AgencyInviteSerializer,
    AgencyMembershipSerializer,
    AgencyProfileSerializer,
    CleanerProfileSerializer,
    CookieConsentSerializer,
    HostProfileSerializer,
    LoginSerializer,
    PublicCleanerDetailSerializer,
    PublicCleanerSerializer,
    SignupEmailCodeRequestSerializer,
    SignupEmailCodeVerifySerializer,
    SignupSerializer,
    UserSerializer,
)
from apps.core.models import AuditLog
from config.verification import validate_runtime_verification_configuration


User = get_user_model()
logger = logging.getLogger("apps.accounts")


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SignupView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            validate_runtime_verification_configuration()
        except ImproperlyConfigured:
            logger.error(
                "Signup blocked by verification configuration",
                extra={"event": "verification.bypass_unavailable"},
            )
            return Response(
                {
                    "code": "verification_configuration_unavailable",
                    "detail": "Account creation is temporarily unavailable.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        serializer = SignupSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        for operator in User.objects.filter(is_active=True).filter(
            Q(role=User.Role.ADMIN) | Q(is_staff=True)
        ):
            emit_notification_event(
                NotificationEventRequest(
                    event_type="account.created_operator_review",
                    recipient_id=operator.id,
                    occurrence_key=f"account:{user.id}:created:v1",
                    destination="/admin",
                    source_entity_type="User",
                    source_entity_id=str(user.id),
                    request_id=get_request_id(),
                )
            )
        write_audit_log(
            actor=user,
            action="account.created",
            entity_type="User",
            entity_id=user.id,
            request=request,
            metadata={"role": user.role},
        )
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SignupEmailCodeRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SignupEmailCodeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        verification, code = SignupEmailVerification.create_for_email(serializer.validated_data["email"])
        verification_required = getattr(settings, "EMAIL_VER_USER_SIGNUP", True)
        if verification_required:
            send_signup_email_code.delay(verification.id)
        else:
            verification.verified_at = timezone.now()
            verification.save(update_fields=["verified_at", "updated_at"])
        write_audit_log(
            action="user.signup_email_code_requested",
            entity_type="SignupEmailVerification",
            entity_id=verification.id,
            request=request,
        )
        response_data = {
            "email": verification.email,
            "expires_at": verification.expires_at,
            "verification_required": verification_required,
        }
        if not verification_required:
            response_data["email_verification_token"] = str(verification.token)
        return Response(response_data, status=status.HTTP_201_CREATED)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SignupEmailCodeVerifyView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SignupEmailCodeVerifySerializer(data=request.data)
        if not serializer.is_valid():
            logger.warning(
                "Signup email code verification failed",
                extra={
                    "event": "signup.invalid_code",
                    "method": request.method,
                    "endpoint_template": get_endpoint_template(request),
                    "status_code": status.HTTP_400_BAD_REQUEST,
                },
            )
            raise ValidationError(serializer.errors)
        verification = serializer.validated_data["verification"]
        write_audit_log(
            action="user.email_verified",
            entity_type="SignupEmailVerification",
            entity_id=verification.id,
            request=request,
        )
        return Response({"email": verification.email, "email_verification_token": str(verification.token)})


class ConfirmEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, uidb64, token):
        try:
            user_id = urlsafe_base64_decode(uidb64).decode()
        except (TypeError, ValueError, OverflowError):
            return Response({"detail": "Invalid confirmation link."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                user = User.objects.select_for_update().get(pk=user_id)
                if not email_verification_token.check_token(user, token):
                    return Response(
                        {"detail": "Invalid or expired confirmation link."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if user.email_verified_at is None:
                    user.email_verified_at = timezone.now()
                    user.save(update_fields=["email_verified_at"])
                    write_audit_log(
                        actor=user,
                        action="user.email_verified",
                        entity_type="User",
                        entity_id=user.id,
                        request=request,
                    )

                reconcile_contact_verification(
                    user_id=user.id,
                    trigger="legacy_email_confirmation",
                    request=request,
                )
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid confirmation link."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ImproperlyConfigured:
            logger.error(
                "Email confirmation blocked by verification configuration",
                extra={"event": "verification.bypass_unavailable"},
            )
            return Response(
                {
                    "code": "verification_configuration_unavailable",
                    "detail": "Email confirmation is temporarily unavailable.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        redirect_url = f"{settings.FRONTEND_URL.rstrip('/')}/login?email_confirmed=1"
        return redirect(redirect_url)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfTokenView(APIView):
    """
    GET /api/accounts/csrf/

    No-op endpoint whose only purpose is to let the browser obtain the
    csrftoken cookie before it submits any state-changing request (login,
    signup, etc.).  Django's CsrfViewMiddleware rejects POST requests that
    arrive without the cookie; calling this endpoint on page mount fixes
    fresh sessions (incognito, new browser, cleared cookies).
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            logger.warning(
                "Login failed",
                extra={
                    "event": "login.failed",
                    "method": request.method,
                    "endpoint_template": get_endpoint_template(request),
                    "status_code": status.HTTP_400_BAD_REQUEST,
                },
            )
            raise ValidationError(serializer.errors)
        user = serializer.validated_data["user"]
        login(request, user)
        write_audit_log(
            actor=user,
            action="login.succeeded",
            entity_type="User",
            entity_id=user.id,
            request=request,
            metadata={"role": user.role},
        )
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        logout(request)
        write_audit_log(
            actor=user,
            action="logout.succeeded",
            entity_type="User",
            entity_id=user.id,
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def delete(self, request):
        user = request.user
        try:
            delete_account_permanently(user=user, request=request)
        except AccountDeletionBlocked as exc:
            return Response(
                {"code": exc.code, "detail": exc.detail, "fields": exc.fields},
                status=status.HTTP_409_CONFLICT,
            )
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CookieConsentView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        queryset = CookieConsent.objects.all()
        if request.user.is_authenticated:
            consent = queryset.filter(user=request.user).first()
        else:
            visitor_id = request.query_params.get("visitor_id", "").strip()
            consent = queryset.filter(visitor_id=visitor_id).first() if visitor_id else None
        if consent is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(CookieConsentSerializer(consent).data)

    def post(self, request):
        serializer = CookieConsentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        consent = serializer.save()
        return Response(CookieConsentSerializer(consent).data, status=status.HTTP_201_CREATED)


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    protected_transition_fields = {
        "role",
        "account_status",
        "approved_at",
        "approved_by",
        "email_verified_at",
        "phone_verified_at",
        "is_staff",
        "is_superuser",
    }

    def get_serializer_class(self):
        user = self.request.user
        if getattr(user, "is_authenticated", False) and user.is_platform_admin:
            return AdminUserSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsPlatformAdmin()]
        if self.action in {
            "reconcile_verification",
            "reject",
            "suspend",
            "review_history",
        }:
            return [IsPlatformAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin:
            return User.objects.all().order_by("id")
        return User.objects.filter(id=user.id)

    def update(self, request, *args, **kwargs):
        if self.protected_transition_fields.intersection(request.data):
            return Response(
                {
                    "code": "protected_transition_field",
                    "detail": "Verification and account transitions require a dedicated action.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="reconcile-verification")
    def reconcile_verification(self, request, pk=None):
        user = self.get_object()
        try:
            result = reconcile_contact_verification(
                user_id=user.id,
                trigger="admin_reconciliation",
                actor=request.user,
                request=request,
            )
        except ImproperlyConfigured:
            return Response(
                {
                    "code": "verification_configuration_unavailable",
                    "detail": "Verification configuration is unavailable.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        still_incomplete = (
            result.user.account_status != User.AccountStatus.APPROVED
            or (
                result.cleaner_profile is not None
                and result.cleaner_profile.verification_status
                != CleanerProfile.VerificationStatus.VERIFIED
            )
        )
        if not result.changed and still_incomplete:
            return Response(
                {
                    "code": "verification_prerequisites_incomplete",
                    "detail": "Stored contact-verification prerequisites are incomplete.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {
                "user": AdminUserSerializer(
                    result.user, context={"request": request}
                ).data,
                "changed": result.changed,
            }
        )

    def _transition_response(self, request, service, user_id):
        serializer = AccountTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = service(
                user_id=user_id,
                actor=request.user,
                request=request,
                **serializer.validated_data,
            )
        except AccountTransitionError as error:
            return Response(
                {"code": error.code, "detail": error.detail, "fields": error.fields},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {
                "user": AdminUserSerializer(
                    result.user, context={"request": request}
                ).data,
                "changed": result.changed,
            }
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        user = self.get_object()
        return self._transition_response(request, reject_account, user.id)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        user = self.get_object()
        return self._transition_response(request, suspend_account, user.id)

    @action(detail=True, methods=["get"], url_path="review-history")
    def review_history(self, request, pk=None):
        user = self.get_object()
        entity_filters = Q(entity_type="User", entity_id=str(user.id))
        profile = getattr(user, "cleaner_profile", None)
        if profile is not None:
            entity_filters |= Q(
                entity_type="CleanerProfile", entity_id=str(profile.id)
            )
        history = AuditLog.objects.filter(entity_filters).select_related("actor")
        return Response(
            [
                {
                    "action": item.action,
                    "actor": item.actor.get_username() if item.actor else "system",
                    "timestamp": item.created_at,
                    "outcome": item.metadata.get("outcome", ""),
                    "reason_category": item.metadata.get("reason_category", ""),
                    "internal_note": item.metadata.get("internal_note", ""),
                    "previous_status": item.metadata.get("previous_status", ""),
                    "next_status": item.metadata.get("next_status", ""),
                }
                for item in history
            ]
        )


class HostProfileViewSet(viewsets.ModelViewSet):
    serializer_class = HostProfileSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin:
            return HostProfile.objects.select_related("user").all().order_by("id")
        return HostProfile.objects.select_related("user").filter(user=user)


class CleanerProfileViewSet(viewsets.ModelViewSet):
    serializer_class = CleanerProfileSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = CleanerProfile.objects.select_related("user").all().order_by("id")
        if user.is_platform_admin:
            return queryset
        if user.is_agency and user.is_active and user.is_approved:
            return queryset.filter(user__agency_memberships__agency__user=user, user__agency_memberships__status=AgencyMembership.Status.ACTIVE)
        return queryset.filter(user=user)

    def update(self, request, *args, **kwargs):
        if "verification_status" in request.data:
            return Response(
                {
                    "code": "protected_transition_field",
                    "detail": "Cleaner marketplace status requires reconciliation.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        if (
            not self.request.user.is_platform_admin
            and serializer.instance.user_id != self.request.user.id
        ):
            raise PermissionDenied("You can update only your own cleaner profile.")
        serializer.save()


class PublicCleanerViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Browsable, reputation-first cleaner directory.

    Lists only verified + approved cleaners and exposes safe fields only
    (no email/phone/birth_date). Detail embeds the cleaner's received reviews.

        GET /api/accounts/public-cleaners/?service_area=&min_rating=&q=
        GET /api/accounts/public-cleaners/<id>/
    """

    permission_classes = [permissions.AllowAny]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PublicCleanerDetailSerializer
        return PublicCleanerSerializer

    def get_queryset(self):
        queryset = (
            CleanerProfile.objects.select_related("user")
            .filter(**CleanerProfile.public_marketplace_eligible_filter())
            .order_by("-average_rating", "-completed_jobs_count", "id")
        )

        params = self.request.query_params

        min_rating = params.get("min_rating")
        if min_rating:
            try:
                queryset = queryset.filter(average_rating__gte=float(min_rating))
            except (TypeError, ValueError):
                pass

        q = params.get("q", "").strip()
        if q:
            queryset = queryset.filter(
                Q(display_name__icontains=q) | Q(bio__icontains=q)
            )

        # service_area: JSON list membership filtered in Python for DB portability.
        # Only for list (detail/get_object needs a real queryset with .filter()).
        city = params.get("city", "").strip().lower()
        if city and self.action == "list":
            queryset = [
                cleaner
                for cleaner in queryset
                if cleaner.city.strip().lower() == city
                or (
                    not cleaner.city
                    and any(city == str(area).strip().lower() for area in (cleaner.service_areas or []))
                )
            ]

        area = params.get("service_area", "").strip().lower()
        if area and self.action == "list":
            queryset = [
                cleaner
                for cleaner in queryset
                if any(area in str(a).lower() for a in (cleaner.service_areas or []))
            ]

        return queryset


class AgencyProfileViewSet(viewsets.ModelViewSet):
    serializer_class = AgencyProfileSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = AgencyProfile.objects.select_related("user").annotate(
            members_count=Count("memberships", filter=Q(memberships__status=AgencyMembership.Status.ACTIVE))
        )
        if user.is_platform_admin:
            return queryset.order_by("company_name")
        if user.is_agency:
            return queryset.filter(user=user)
        return queryset.none()

    def perform_create(self, serializer):
        if not (self.request.user.is_platform_admin or self.request.user.is_agency):
            raise PermissionDenied("Only agency accounts can create agency profiles.")
        if not self.request.user.is_platform_admin and hasattr(self.request.user, "agency_profile"):
            raise PermissionDenied("This agency account already has a profile.")
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="invite-cleaner")
    def invite_cleaner(self, request, pk=None):
        agency = self.get_object()
        if not (request.user.is_platform_admin or agency.user_id == request.user.id):
            raise PermissionDenied("You can invite cleaners only for your own agency.")
        try:
            ensure_agency_can_invite(agency_user=agency.user)
        except AccountTransitionError as error:
            raise PermissionDenied(detail=error.detail, code=error.code) from error

        serializer = AgencyInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data.get("email", "")
        phone_number = serializer.validated_data.get("phone_number", "")

        duplicate_filter = Q(status=AgencyInvitation.Status.PENDING)
        if email:
            duplicate_filter &= Q(email__iexact=email)
        else:
            duplicate_filter &= Q(phone_number=phone_number)

        if agency.invitations.filter(duplicate_filter).exists():
            raise ValidationError("A pending invitation already exists for this cleaner.")

        invitation = AgencyInvitation.objects.create(
            agency=agency,
            email=email,
            phone_number=phone_number,
            message=serializer.validated_data.get("message", ""),
            invited_by=request.user,
            token=uuid.uuid4().hex,
        )
        return Response(AgencyInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


class AgencyInvitationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AgencyInvitationSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = AgencyInvitation.objects.select_related("agency", "agency__user", "cleaner")
        if user.is_platform_admin:
            return queryset
        if user.is_agency:
            return queryset.filter(agency__user=user)
        if user.is_cleaner:
            contact_filter = Q(cleaner=user)
            if user.email:
                contact_filter |= Q(status=AgencyInvitation.Status.PENDING, email__iexact=user.email)
            if user.phone_number:
                contact_filter |= Q(
                    status=AgencyInvitation.Status.PENDING,
                    phone_number=user.phone_number,
                )
            return queryset.filter(contact_filter)
        return queryset.none()

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        invitation = self.get_object()
        user = request.user
        if not user.is_cleaner:
            raise PermissionDenied("Only cleaner accounts can accept agency invitations.")
        try:
            ensure_invitation_can_be_accepted(
                agency_user=invitation.agency.user,
                cleaner=user,
            )
        except AccountTransitionError as error:
            raise PermissionDenied(detail=error.detail, code=error.code) from error
        if invitation.status != AgencyInvitation.Status.PENDING:
            raise ValidationError("Only pending invitations can be accepted.")
        if invitation.is_expired:
            invitation.status = AgencyInvitation.Status.EXPIRED
            invitation.save(update_fields=["status", "updated_at"])
            raise ValidationError("This invitation has expired.")

        email_matches = bool(invitation.email and user.email and invitation.email.lower() == user.email.lower())
        phone_matches = bool(invitation.phone_number and invitation.phone_number == user.phone_number)
        if not (email_matches or phone_matches):
            raise PermissionDenied("This invitation does not match your account email or phone number.")

        membership, created = AgencyMembership.objects.get_or_create(
            agency=invitation.agency,
            cleaner=user,
            defaults={
                "invited_by": invitation.invited_by,
                "invitation": invitation,
                "status": AgencyMembership.Status.ACTIVE,
            },
        )
        if not created and membership.status != AgencyMembership.Status.ACTIVE:
            membership.status = AgencyMembership.Status.ACTIVE
            membership.revoked_at = None
            membership.invitation = invitation
            membership.save(update_fields=["status", "revoked_at", "invitation", "updated_at"])

        invitation.status = AgencyInvitation.Status.ACCEPTED
        invitation.cleaner = user
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["status", "cleaner", "accepted_at", "updated_at"])
        return Response(AgencyMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class AgencyMembershipViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AgencyMembershipSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = AgencyMembership.objects.select_related("agency", "cleaner", "invited_by", "invitation")
        if user.is_platform_admin:
            return queryset
        if user.is_agency:
            return queryset.filter(agency__user=user)
        if user.is_cleaner:
            return queryset.filter(cleaner=user)
        return queryset.none()
