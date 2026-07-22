import logging
import re
from datetime import timedelta

from django.db.models import Q
from django.contrib.auth import get_user_model
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, Throttled, ValidationError
from rest_framework.response import Response

from apps.core.services import write_audit_log
from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningBatch,
    CleaningJob,
    Dispute,
    FavouriteCleaner,
    JobIncident,
    ReplacementRequest,
    RescheduleProposal,
    TurnoverLineage,
)
from apps.marketplace.serializers import (
    AssignMemberSerializer,
    AssignedWorkerAssignmentSerializer,
    AssignmentSerializer,
    CleanerApplicationSerializer,
    CleanerApplicationCreateSerializer,
    CleaningBatchSerializer,
    CleaningJobSerializer,
    CancelJobSerializer,
    DisputeCreateSerializer,
    DisputeUpdateSerializer,
    FavouriteCleanerSerializer,
    MarketplaceCalendarItemSerializer,
    OfferJobSerializer,
    OfferToCleanerSerializer,
    OperatorMatchingInvitationSerializer,
    OperatorReminderSerializer,
    ReplacementRequestCreateSerializer,
    ReplacementResponseSerializer,
    RecoveryRequestSerializer,
    RescheduleProposalCreateSerializer,
    RescheduleResponseSerializer,
    JobIncidentCreateSerializer,
    PublicDemandSerializer,
    WorkerCleanerApplicationSerializer,
    WorkerCleaningJobSerializer,
)
from apps.locations.models import City
from apps.marketplace.selectors import (
    application_jobs_for_user,
    build_public_demand,
    calendar_open_jobs_for_user,
    canonical_location_values,
    safe_host_display_name,
    user_is_eligible_evaluator,
    valid_future_marketplace_jobs,
    with_canonical_marketplace_location,
    worker_visible_jobs,
)
from apps.marketplace.services import (
    CleanerScheduleConflictError,
    MarketplaceError,
    accept_application,
    accept_reschedule_proposal,
    authorize_replacement_request,
    accept_offer,
    assign_member_to_assignment,
    complete_job,
    create_favourite_cleaner,
    decline_offer,
    offer_job,
    offer_job_to_cleaner,
    publish_job,
    cancel_job,
    create_replacement_request,
    create_cleaning_job,
    derive_available_job_actions,
    file_dispute,
    LifecycleError,
    lifecycle_actor_is_eligible,
    lineage_chronology,
    propose_reschedule,
    report_job_incident,
    reject_application,
    submit_application,
    withdraw_application,
    respond_to_reschedule_proposal,
    send_operator_matching_invitation,
    send_upcoming_work_reminder,
    update_dispute,
)
from apps.marketplace.throttles import LifecycleWriteThrottle, RecoveryCaseWriteThrottle
from apps.properties.models import Property


User = get_user_model()
logger = logging.getLogger("apps.marketplace")
PUBLIC_CITY_SLUG_PATTERN = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
PUBLIC_CITY_SLUG_MAX_LENGTH = 64


def marketplace_error_response(exc: MarketplaceError) -> Response:
    if isinstance(exc, LifecycleError):
        return Response(
            {"code": exc.code, "detail": exc.detail, "fields": exc.fields},
            status=exc.status_code,
        )
    if isinstance(exc, CleanerScheduleConflictError):
        return Response(
            {"code": exc.code, "detail": str(exc)},
            status=status.HTTP_409_CONFLICT,
        )
    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


def lifecycle_error_response(code: str, detail: str, *, status_code: int, fields=None):
    return Response(
        {"code": code, "detail": detail, "fields": fields or {}},
        status=status_code,
    )


def lifecycle_job_for_actor(*, job_id, actor):
    try:
        job = (
            CleaningJob.objects.select_related(
                "host", "property", "lineage", "assignment", "assignment__cleaner"
            )
            .get(pk=job_id)
        )
    except CleaningJob.DoesNotExist as exc:
        raise Http404 from exc
    assignment = get_job_assignment(job)
    participant_ids = {
        job.host_id,
        getattr(assignment, "cleaner_id", None),
        getattr(assignment, "assigned_member_id", None),
    }
    if not actor.is_platform_admin and actor.id not in participant_ids:
        raise Http404
    return job


class LifecycleErrorResponseMixin:
    def handle_exception(self, exc):
        if isinstance(exc, Http404):
            return lifecycle_error_response(
                "not_found",
                "The requested object was not found.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        if isinstance(exc, Throttled):
            return lifecycle_error_response(
                "rate_limited",
                "Too many lifecycle requests. Try again later.",
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return super().handle_exception(exc)


def public_city_slug_from_request(request):
    value = request.query_params.get("city") or ""
    if value and (
        len(value) > PUBLIC_CITY_SLUG_MAX_LENGTH
        or PUBLIC_CITY_SLUG_PATTERN.fullmatch(value) is None
    ):
        raise ValueError("Invalid city filter.")
    return value


def parse_calendar_bound(value):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def in_calendar_window(queryset, start, end, prefix=""):
    if start is not None:
        queryset = queryset.filter(**{f"{prefix}scheduled_end__gte": start})
    if end is not None:
        queryset = queryset.filter(**{f"{prefix}scheduled_start__lt": end})
    return queryset


def job_calendar_payload(job, item_type, user, application=None, assignment=None):
    location = canonical_location_values(job)
    if user.is_platform_admin:
        access_tier = "admin"
    elif job.host_id == user.id:
        access_tier = "owner"
    elif assignment is not None and assignment.cancelled_at is None and user.id in {
        assignment.cleaner_id,
        assignment.assigned_member_id,
    }:
        access_tier = (
            "assigned"
            if job.status == CleaningJob.Status.ASSIGNED and assignment.completed_at is None
            else "history"
        )
    else:
        access_tier = "evaluator"

    payload = {
        "id": f"{item_type}:{job.id}:{getattr(application, 'id', '') or getattr(assignment, 'id', '') or job.id}",
        "item_type": item_type,
        "job": job.id,
        "access_tier": access_tier,
        **location,
        "scheduled_start": job.scheduled_start,
        "scheduled_end": job.scheduled_end,
        "currency": job.currency,
        "proposed_price": job.proposed_price,
        "bedrooms": job.property.bedrooms,
        "square_metres": job.property.square_meters,
        "status": job.status,
        "can_apply": (
            access_tier == "evaluator"
            and item_type == "open_job"
            and not bool(getattr(job, "has_user_application", False))
        ),
        "can_complete": user_can_complete_calendar_assignment(user, assignment, job),
    }
    if application is not None:
        payload.update(
            {
                "application": application.id,
                "application_status": application.status,
                "application_origin": application.origin,
            }
        )
    if assignment is not None:
        payload.update(
            {
                "assignment": assignment.id,
                "host_completed_at": assignment.host_completed_at,
                "cleaner_completed_at": assignment.cleaner_completed_at,
                "completed_at": assignment.completed_at,
            }
        )
    if access_tier in {"assigned", "owner", "admin"}:
        first_image = min(
            job.property.images.all(),
            key=lambda img: (img.order, img.id),
            default=None,
        )
        payload.update(
            {
                "property_name": job.property.name,
                "property_address": job.property.address,
                "property_image": (
                    f"/api/properties/images/{first_image.id}/content/" if first_image else None
                ),
                "host": job.host_id,
                "host_name": safe_host_display_name(job.host),
                "agreed_price": (
                    getattr(assignment, "agreed_price", None) or job.agreed_price
                ),
                "cleaning_instructions": job.cleaning_instructions,
            }
        )
        if access_tier in {"owner", "admin"}:
            payload.update({"title": job.title, "description": job.description})
    elif access_tier == "history":
        payload.update(
            {
                "host": job.host_id,
                "host_name": safe_host_display_name(job.host),
                "agreed_price": (
                    getattr(assignment, "agreed_price", None) or job.agreed_price
                ),
            }
        )
    return payload


def get_job_assignment(job):
    try:
        return job.assignment
    except Assignment.DoesNotExist:
        return None


def user_can_apply_to_calendar_job(user):
    if user.is_agency:
        return True
    if not user.is_cleaner:
        return False
    profile = getattr(user, "cleaner_profile", None)
    return bool(profile and profile.is_verified)


def user_can_complete_calendar_assignment(user, assignment, job):
    if assignment is None or assignment.completed_at is not None or job.status != CleaningJob.Status.ASSIGNED:
        return False
    now = timezone.now()
    if user.is_platform_admin:
        return job.scheduled_end <= now
    if user.id == job.host_id:
        return assignment.host_completed_at is None and job.scheduled_end <= now
    if user.id == assignment.cleaner_id or user.id == assignment.assigned_member_id:
        return assignment.cleaner_completed_at is None and job.scheduled_start <= now
    return False


class MarketplaceQuerysetMixin:
    def filter_for_user(self, queryset):
        user = self.request.user
        if user.is_platform_admin:
            return queryset
        if not user.is_active or not user.is_approved:
            return queryset.none()
        if user.is_host:
            return queryset.filter(host=user)
        if user.is_cleaner or user.is_agency:
            return worker_visible_jobs(user, queryset)
        return queryset.none()


class PrivateNoStoreResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["Pragma"] = "no-cache"
        response["Clear-Site-Data"] = '"cache"'
        return response


class MarketplaceCalendarView(PrivateNoStoreResponseMixin, views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if not user.is_active or not user.is_approved:
            return Response([])
        if (user.is_cleaner or user.is_agency) and not user_is_eligible_evaluator(user):
            return Response([])

        start = parse_calendar_bound(request.query_params.get("start"))
        end = parse_calendar_bound(request.query_params.get("end"))
        items = []

        if user.is_platform_admin:
            jobs = in_calendar_window(
                with_canonical_marketplace_location(
                    CleaningJob.objects.select_related("property", "host", "assignment")
                )
                .prefetch_related("property__images")
                .all(),
                start,
                end,
            )
            for job in jobs:
                assignment = get_job_assignment(job)
                item_type = "assignment" if assignment else "open_job"
                items.append(job_calendar_payload(job, item_type, user, assignment=assignment))
            serializer = MarketplaceCalendarItemSerializer(items, many=True)
            return Response(serializer.data)

        if user.is_host:
            jobs = in_calendar_window(
                with_canonical_marketplace_location(
                    CleaningJob.objects.select_related("property", "host", "assignment")
                )
                .prefetch_related("property__images")
                .filter(host=user),
                start,
                end,
            )
            job_list = list(jobs)
            pending_offers = {
                offer.job_id: offer
                for offer in CleanerApplication.objects.select_related("cleaner").filter(
                    job__in=[j.id for j in job_list],
                    origin=CleanerApplication.Origin.HOST_OFFERED,
                    status=CleanerApplication.Status.PENDING,
                )
            }
            for job in job_list:
                assignment = get_job_assignment(job)
                if assignment:
                    items.append(job_calendar_payload(job, "assignment", user, assignment=assignment))
                elif job.id in pending_offers:
                    items.append(
                        job_calendar_payload(job, "offer", user, application=pending_offers[job.id])
                    )
                else:
                    items.append(job_calendar_payload(job, "open_job", user))
            serializer = MarketplaceCalendarItemSerializer(items, many=True)
            return Response(serializer.data)

        if user.is_cleaner or user.is_agency:
            assignment_filter = Q(cleaner=user)
            if user.is_cleaner:
                assignment_filter |= Q(assigned_member=user)
            assignment_queryset = in_calendar_window(
                Assignment.objects.select_related(
                    "job",
                    "job__property",
                    "job__property__service_zone__city",
                    "job__host",
                    "application",
                )
                .prefetch_related("job__property__images")
                .filter(assignment_filter, cancelled_at__isnull=True),
                start,
                end,
                "job__",
            )
            assigned_job_ids = set()
            for assignment in assignment_queryset:
                assigned_job_ids.add(assignment.job_id)
                items.append(
                    job_calendar_payload(
                        assignment.job,
                        "assignment",
                        user,
                        application=assignment.application,
                        assignment=assignment,
                    )
                )

            application_queryset = in_calendar_window(
                CleanerApplication.objects.select_related(
                    "job",
                    "job__property",
                    "job__property__service_zone__city",
                    "job__host",
                )
                .filter(cleaner=user)
                .exclude(status=CleanerApplication.Status.WITHDRAWN),
                start,
                end,
                "job__",
            ).exclude(job_id__in=assigned_job_ids)
            applied_job_ids = set()
            for application in application_queryset:
                applied_job_ids.add(application.job_id)
                app_item_type = (
                    "offer"
                    if application.origin == CleanerApplication.Origin.HOST_OFFERED
                    and application.status == CleanerApplication.Status.PENDING
                    else "application"
                )
                items.append(job_calendar_payload(application.job, app_item_type, user, application=application))

            open_jobs = in_calendar_window(
                calendar_open_jobs_for_user(
                    user,
                    CleaningJob.objects.select_related("property", "host"),
                ).exclude(id__in=assigned_job_ids | applied_job_ids),
                start,
                end,
            )
            for job in open_jobs:
                items.append(job_calendar_payload(job, "open_job", user))

            serializer = MarketplaceCalendarItemSerializer(items, many=True)
            return Response(serializer.data)

        return Response([])


class AreaStatsView(views.APIView):
    """
    Public, privacy-safe marketplace demand/supply stats for the landing page.

    Returns aggregate counts only — no user identities. An optional ?city=
    narrows the cleaner/host/open-job counts to a single city so the landing
    "find cleaning work" panel can show live local demand.

    GET /api/marketplace/area-stats/?city=sofia
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from apps.accounts.models import CleanerProfile, HostProfile

        try:
            city_slug = public_city_slug_from_request(request)
        except ValueError:
            return mark_no_store(
                Response(
                    {"detail": "Invalid city filter.", "code": "invalid_city_filter"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            )

        selected_city = None
        if city_slug:
            try:
                selected_city = City.objects.get(is_active=True, slug=city_slug)
            except City.DoesNotExist:
                return mark_no_store(
                    Response(
                        {"detail": "City was not found.", "code": "city_not_found"},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                )
        now = timezone.now()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        cleaners = CleanerProfile.objects.filter(
            verification_status=CleanerProfile.VerificationStatus.VERIFIED,
            user__account_status=User.AccountStatus.APPROVED,
            user__is_active=True,
        )
        hosts = HostProfile.objects.filter(
            user__account_status=User.AccountStatus.APPROVED,
            user__is_active=True,
        )
        open_jobs = valid_future_marketplace_jobs()

        if selected_city is not None:
            exact_city_names = Q(city=selected_city.slug) | Q(
                city=selected_city.name_bg
            ) | Q(city=selected_city.name_en)
            cleaners = cleaners.filter(exact_city_names)
            hosts = hosts.filter(exact_city_names)
            legacy_property_city = (
                Q(property__city=selected_city.slug)
                | Q(property__city=selected_city.name_bg)
                | Q(property__city=selected_city.name_en)
            )
            open_jobs = open_jobs.filter(
                Q(property__service_zone__city=selected_city)
                | (Q(property__service_zone__isnull=True) & legacy_property_city)
            )

        return mark_no_store(Response(
            {
                "city": selected_city.slug if selected_city is not None else "",
                "verified_cleaners": cleaners.count(),
                "active_hosts": hosts.count(),
                "open_jobs": open_jobs.count(),
                "jobs_this_week": open_jobs.filter(created_at__gte=week_ago).count(),
                "jobs_this_month": open_jobs.filter(created_at__gte=month_ago).count(),
            }
        ))


def mark_no_store(response):
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    response["Clear-Site-Data"] = '"cache"'
    return response


class PublicDemandView(views.APIView):
    """Canonical anonymous city/district demand aggregate."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            city_identifier = public_city_slug_from_request(request)
        except ValueError:
            return mark_no_store(
                Response(
                    {"detail": "Invalid city filter.", "code": "invalid_city_filter"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            )
        try:
            payload = build_public_demand(city_identifier=city_identifier)
        except City.DoesNotExist:
            return mark_no_store(
                Response(
                    {"detail": "City was not found.", "code": "city_not_found"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            )
        serializer = PublicDemandSerializer(payload)
        return mark_no_store(Response(serializer.data))


class OpenJobLocationsView(PublicDemandView):
    """Temporary compatibility alias for the former exact-marker endpoint."""

    def get(self, request):
        response = super().get(request)
        response["Deprecation"] = "true"
        response["Sunset"] = "Thu, 15 Oct 2026 00:00:00 GMT"
        response["Link"] = '</api/marketplace/public-demand/>; rel="successor-version"'
        return response


class CleaningBatchViewSet(viewsets.ModelViewSet):
    serializer_class = CleaningBatchSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = CleaningBatch.objects.select_related("property", "host")
        if user.is_platform_admin:
            return queryset
        return queryset.filter(host=user)

    def create(self, request, *args, **kwargs):
        if not request.user.is_platform_admin and (
            not request.user.is_host
            or not request.user.is_active
            or not request.user.is_approved
        ):
            raise PermissionDenied("Only approved hosts can create cleaning batches.")
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        property = serializer.validated_data["property"]
        if not (self.request.user.is_platform_admin or self.request.user.is_host):
            raise PermissionDenied("Only hosts can create cleaning batches.")
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating cleaning batches.")
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Hosts can create batches only for their own properties.")
        job = serializer.save(host=property.host)
        write_audit_log(
            actor=self.request.user,
            action="job.created",
            entity_type="CleaningJob",
            entity_id=job.id,
            request=self.request,
            metadata={"status": job.status},
        )

    def perform_update(self, serializer):
        property = serializer.validated_data.get("property", serializer.instance.property)
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Hosts can update batches only for their own properties.")
        serializer.save(host=property.host)


class CleaningJobViewSet(
    PrivateNoStoreResponseMixin,
    LifecycleErrorResponseMixin,
    MarketplaceQuerysetMixin,
    viewsets.ModelViewSet,
):
    serializer_class = CleaningJobSerializer

    def get_serializer_class(self):
        user = self.request.user
        if (
            self.action not in {"create", "update", "partial_update"}
            and (user.is_cleaner or user.is_agency)
        ):
            return WorkerCleaningJobSerializer
        return CleaningJobSerializer

    def get_queryset(self):
        queryset = CleaningJob.objects.select_related(
            "property",
            "property__service_zone__city",
            "host",
            "batch",
            "assignment",
            "assignment__cleaner",
            "assignment__cleaner__cleaner_profile",
            "assignment__assigned_member",
            "assignment__application",
        ).prefetch_related("property__images")
        queryset = self.filter_for_user(queryset)
        city = self.request.query_params.get("city", "").strip()
        neighborhood = self.request.query_params.get("neighborhood", "").strip()
        zone_id = self.request.query_params.get("zone_id", "").strip()
        user = self.request.user
        if (user.is_cleaner or user.is_agency) and user_is_eligible_evaluator(user):
            if city:
                if (
                    len(city) > PUBLIC_CITY_SLUG_MAX_LENGTH
                    or PUBLIC_CITY_SLUG_PATTERN.fullmatch(city) is None
                ):
                    raise ValidationError({"city": "Use a canonical city slug."})
                queryset = queryset.filter(marketplace_city_slug=city)
            if zone_id:
                match = re.fullmatch(r"sofia:osm-([1-9]\d{0,2})", zone_id)
                if match is None or int(match.group(1)) > 144:
                    raise ValidationError({"zone_id": "Use a canonical Sofia zone ID."})
                queryset = queryset.filter(
                    property__service_zone__city__slug="sofia",
                    property__service_zone__slug=f"osm-{int(match.group(1))}",
                )
            # Never evaluate worker input against raw legacy location text. The
            # old compatibility parameter is intentionally ignored.
        else:
            if city:
                queryset = queryset.filter(property__city__iexact=city)
            if neighborhood:
                queryset = queryset.filter(property__neighborhood__icontains=neighborhood)
        return queryset

    @action(detail=True, methods=["post"], url_path="operator-match-invite")
    def operator_match_invite(self, request, pk=None):
        if not request.user.is_platform_admin:
            raise PermissionDenied("Only a platform operator can send matching invitations.")
        serializer = OperatorMatchingInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = get_object_or_404(CleaningJob, id=pk)
        cleaner = get_object_or_404(User, id=serializer.validated_data["cleaner_id"])
        try:
            result = send_operator_matching_invitation(
                job=job,
                cleaner=cleaner,
                actor=request.user,
                occurrence_token=serializer.validated_data["occurrence_token"],
                request=request,
            )
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response({"event_id": result.event.id, "created": result.created})

    @action(detail=True, methods=["post"], url_path="operator-remind")
    def operator_remind(self, request, pk=None):
        if not request.user.is_platform_admin:
            raise PermissionDenied("Only a platform operator can send work reminders.")
        serializer = OperatorReminderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = get_object_or_404(CleaningJob, id=pk)
        try:
            results = send_upcoming_work_reminder(
                job=job,
                actor=request.user,
                occurrence_at=serializer.validated_data["occurrence_at"],
                request=request,
            )
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response(
            {
                "events": [result.event.id for result in results],
                "created": sum(1 for result in results if result.created),
            }
        )

    def create(self, request, *args, **kwargs):
        if not request.user.is_platform_admin and (
            not request.user.is_host
            or not request.user.is_active
            or not request.user.is_approved
        ):
            raise PermissionDenied("Only approved hosts can create cleaning jobs.")
        if not request.user.is_platform_admin:
            requested_property = request.data.get("property_id")
            if requested_property not in (None, ""):
                property_host_id = (
                    Property.objects.filter(pk=requested_property)
                    .values_list("host_id", flat=True)
                    .first()
                )
                if property_host_id is not None and property_host_id != request.user.id:
                    raise PermissionDenied("Hosts can create jobs only for their own properties.")
        try:
            return super().create(request, *args, **kwargs)
        except LifecycleError as exc:
            return marketplace_error_response(exc)

    def perform_create(self, serializer):
        property = serializer.validated_data["property"]
        if not (self.request.user.is_platform_admin or self.request.user.is_host):
            raise PermissionDenied("Only hosts can create cleaning jobs.")
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating cleaning jobs.")
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Hosts can create jobs only for their own properties.")
        values = dict(serializer.validated_data)
        values.pop("property", None)
        serializer.instance = create_cleaning_job(
            actor=self.request.user,
            property=property,
            request=self.request,
            **values,
        )

    def perform_update(self, serializer):
        property = serializer.validated_data.get("property", serializer.instance.property)
        batch = serializer.validated_data.get("batch", serializer.instance.batch)
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Hosts can update jobs only for their own properties.")
        if batch is not None and batch.host_id != property.host_id:
            raise PermissionDenied("Job batch must belong to the same host as the job property.")
        serializer.save(host=property.host)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not request.user.is_platform_admin and instance.host_id != request.user.id:
            raise PermissionDenied("Only the job host or admin can edit this job.")
        if not request.user.is_platform_admin:
            requested_property = request.data.get("property_id")
            if requested_property not in (None, ""):
                property_host_id = (
                    Property.objects.filter(pk=requested_property)
                    .values_list("host_id", flat=True)
                    .first()
                )
                if property_host_id is not None and property_host_id != request.user.id:
                    raise PermissionDenied("Hosts can update jobs only for their own properties.")
            requested_batch = request.data.get("batch_id")
            if requested_batch not in (None, ""):
                batch_host_id = (
                    CleaningBatch.objects.filter(pk=requested_batch)
                    .values_list("host_id", flat=True)
                    .first()
                )
                if batch_host_id is not None and batch_host_id != request.user.id:
                    raise PermissionDenied("Job batches must belong to the job host.")
        if instance.status != CleaningJob.Status.DRAFT:
            return Response(
                {"detail": "Only draft jobs can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = lifecycle_job_for_actor(job_id=kwargs["pk"], actor=request.user)
        if not request.user.is_platform_admin and instance.host_id != request.user.id:
            raise Http404
        return lifecycle_error_response(
            "job_deletion_replaced_by_cancellation",
            "Use the cancellation action for this job.",
            status_code=status.HTTP_409_CONFLICT,
        )

    @action(
        detail=True,
        methods=["post"],
        throttle_classes=[LifecycleWriteThrottle],
    )
    def cancel(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        assignment = get_job_assignment(job)
        if (
            assignment is not None
            and assignment.cleaner.is_agency
            and not (request.user.is_platform_admin or request.user.id == job.host_id)
        ):
            return lifecycle_error_response(
                "agency_recovery_not_supported",
                "Agency recovery is not supported in the Stage 1 pilot. Contact support.",
                status_code=status.HTTP_409_CONFLICT,
            )
        if not lifecycle_actor_is_eligible(request.user):
            return lifecycle_error_response(
                "account_not_eligible",
                "This account is not eligible for lifecycle actions.",
                status_code=status.HTTP_409_CONFLICT,
            )
        serializer = CancelJobSerializer(data=request.data)
        if not serializer.is_valid():
            return lifecycle_error_response(
                "invalid_input",
                "Correct the highlighted fields and try again.",
                status_code=status.HTTP_400_BAD_REQUEST,
                fields=serializer.errors,
            )
        try:
            job = cancel_job(
                job=job,
                actor=request.user,
                reason_code=serializer.validated_data["reason_code"],
                note=serializer.validated_data.get("note", ""),
                request=request,
            )
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response(CleaningJobSerializer(job, context={"request": request}).data)

    def _recovery_input_error(self, serializer):
        if serializer.is_valid():
            return None
        return lifecycle_error_response(
            "invalid_input", "Correct the highlighted fields and try again.",
            status_code=status.HTTP_400_BAD_REQUEST, fields=serializer.errors,
        )

    @action(detail=True, methods=["post"], throttle_classes=[LifecycleWriteThrottle], url_path="reschedule")
    def reschedule(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        serializer = RescheduleProposalCreateSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        try:
            proposal = propose_reschedule(job=job, actor=request.user, request=request, **serializer.validated_data)
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response({"id": proposal.id, "status": proposal.status, "expires_at": proposal.expires_at}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], throttle_classes=[LifecycleWriteThrottle], url_path="reschedule-respond")
    def reschedule_respond(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        serializer = RescheduleResponseSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        proposal = get_object_or_404(RescheduleProposal, pk=serializer.validated_data["proposal_id"], job=job)
        try:
            proposal = respond_to_reschedule_proposal(proposal=proposal, actor=request.user, request=request, accept=serializer.validated_data["accept"])
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response({"id": proposal.id, "status": proposal.status, "job_id": job.id})

    @action(detail=True, methods=["post"], throttle_classes=[RecoveryCaseWriteThrottle], url_path="incidents")
    def incidents(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        serializer = JobIncidentCreateSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        try:
            incident = report_job_incident(job=job, actor=request.user, request=request, **serializer.validated_data)
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response({"id": incident.id, "incident_type": incident.incident_type, "severity": incident.severity, "created_at": incident.created_at}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], throttle_classes=[LifecycleWriteThrottle], url_path="replacement-requests")
    def replacement_requests(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        serializer = ReplacementRequestCreateSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        incident = get_object_or_404(JobIncident, pk=serializer.validated_data["incident_id"], job=job)
        try:
            replacement = create_replacement_request(job=job, incident=incident, actor=request.user, request=request)
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response(RecoveryRequestSerializer(replacement).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], throttle_classes=[LifecycleWriteThrottle], url_path="replacement-respond")
    def replacement_respond(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        serializer = ReplacementResponseSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        replacement = get_object_or_404(ReplacementRequest, pk=serializer.validated_data["replacement_request_id"], source_job=job)
        try:
            replacement = authorize_replacement_request(replacement=replacement, actor=request.user, accept=serializer.validated_data["accept"], request=request)
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response(RecoveryRequestSerializer(replacement).data)

    @action(detail=True, methods=["post"], throttle_classes=[RecoveryCaseWriteThrottle], url_path="disputes")
    def disputes(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        serializer = DisputeCreateSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        try:
            dispute = file_dispute(job=job, actor=request.user, request=request, **serializer.validated_data)
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response({"id": dispute.id, "category": dispute.category, "status": dispute.status, "created_at": dispute.created_at}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="recovery-queues")
    def recovery_queues(self, request):
        if not request.user.is_platform_admin:
            raise Http404
        return Response({
            "replacement_requests": list(ReplacementRequest.objects.filter(status=ReplacementRequest.Status.PENDING_HOST_AUTHORIZATION).values("id", "source_job_id", "status", "expires_at")),
            "disputes": list(Dispute.objects.filter(status=Dispute.Status.OPEN).values("id", "job_id", "category", "status", "created_at")),
            "incidents": list(JobIncident.objects.order_by("-created_at").values("id", "job_id", "incident_type", "severity", "created_at")[:100]),
        })

    @action(detail=False, methods=["post"], throttle_classes=[LifecycleWriteThrottle], url_path=r"disputes/(?P<dispute_id>[^/.]+)/update")
    def dispute_update(self, request, dispute_id=None):
        if not request.user.is_platform_admin:
            raise Http404
        serializer = DisputeUpdateSerializer(data=request.data)
        error = self._recovery_input_error(serializer)
        if error:
            return error
        dispute = get_object_or_404(Dispute, pk=dispute_id)
        try:
            dispute = update_dispute(dispute=dispute, actor=request.user, request=request,
                                    note=serializer.validated_data["note"], status_after=serializer.validated_data.get("status", ""))
        except MarketplaceError as exc:
            return marketplace_error_response(exc)
        return Response({"id": dispute.id, "status": dispute.status})

    @action(detail=True, methods=["get"], url_path="available-actions")
    def available_actions(self, request, pk=None):
        job = lifecycle_job_for_actor(job_id=pk, actor=request.user)
        return Response(
            {"job_id": job.id, "available_actions": derive_available_job_actions(job=job, actor=request.user)}
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        if not request.user.is_platform_admin and (
            not request.user.is_active or not request.user.is_approved
        ):
            raise PermissionDenied("Account must be approved before publishing jobs.")
        job = self.get_object()
        if not request.user.is_platform_admin and job.host_id != request.user.id:
            raise PermissionDenied("Only the job host or admin can publish this job.")
        try:
            job = publish_job(job, actor=request.user, request=request)
        except MarketplaceError as exc:
            logger.warning(
                "Job publish blocked",
                extra={"event": "host.publish_job_denied", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        job = self.get_object()
        assignment = get_job_assignment(job)
        is_assigned_worker = assignment is not None and request.user.id in {
            assignment.cleaner_id,
            assignment.assigned_member_id,
        }
        if not request.user.is_platform_admin and not is_assigned_worker:
            raise PermissionDenied("Only the assigned cleaner or admin can complete this job.")
        try:
            job = complete_job(job=job, completed_by=request.user, request=request)
        except MarketplaceError as exc:
            logger.warning(
                "Job completion blocked",
                extra={"event": "job.complete_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def offer(self, request, pk=None):
        job = self.get_object()
        if not request.user.is_platform_admin and job.host_id != request.user.id:
            raise PermissionDenied("Only the job host or admin can offer this job.")
        serializer = OfferJobSerializer(data={**request.data, "job_id": job.id})
        serializer.is_valid(raise_exception=True)
        try:
            application = offer_job(
                job=serializer.validated_data["job"],
                host=request.user,
                cleaner=serializer.validated_data["cleaner"],
                proposed_price=serializer.validated_data.get("proposed_price"),
                message=serializer.validated_data.get("message", ""),
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Job offer blocked",
                extra={"event": "job.offer_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            CleanerApplicationSerializer(application, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="offer-to-cleaner")
    def offer_to_cleaner(self, request):
        """Offer a job to a cleaner by property + time slot (find-or-create the job)."""
        if not request.user.is_platform_admin and (
            not request.user.is_host
            or not request.user.is_active
            or not request.user.is_approved
        ):
            raise PermissionDenied("Only approved hosts can offer cleaning jobs.")
        serializer = OfferToCleanerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            application = offer_job_to_cleaner(
                host=request.user,
                cleaner=serializer.validated_data["cleaner"],
                property=serializer.validated_data["property"],
                scheduled_start=serializer.validated_data["scheduled_start"],
                scheduled_end=serializer.validated_data["scheduled_end"],
                title=serializer.validated_data.get("title", ""),
                proposed_price=serializer.validated_data.get("proposed_price"),
                message=serializer.validated_data.get("message", ""),
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Job offer blocked",
                extra={"event": "job.offer_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            CleanerApplicationSerializer(application, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TurnoverLineageViewSet(
    PrivateNoStoreResponseMixin,
    LifecycleErrorResponseMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=True, methods=["get"])
    def chronology(self, request, pk=None):
        try:
            lineage = TurnoverLineage.objects.select_related("host", "property").get(pk=pk)
        except TurnoverLineage.DoesNotExist as exc:
            raise Http404 from exc
        if not request.user.is_platform_admin and request.user.id != lineage.host_id:
            is_participant = Assignment.objects.filter(
                job__lineage=lineage,
            ).filter(
                Q(cleaner=request.user) | Q(assigned_member=request.user)
            ).exists()
            if not is_participant:
                raise Http404
        return Response(lineage_chronology(lineage=lineage, actor=request.user))


class CleanerApplicationViewSet(PrivateNoStoreResponseMixin, viewsets.ModelViewSet):
    serializer_class = CleanerApplicationSerializer

    def get_serializer_class(self):
        if self.action == "create":
            return CleanerApplicationCreateSerializer
        if self.request.user.is_cleaner or self.request.user.is_agency:
            return WorkerCleanerApplicationSerializer
        return CleanerApplicationSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = CleanerApplication.objects.select_related(
            "job",
            "cleaner",
            "job__host",
            "job__property",
            "job__property__service_zone__city",
        )
        if user.is_platform_admin:
            return queryset
        if not user.is_active or not user.is_approved:
            return queryset.none()
        if user.is_host:
            return queryset.filter(job__host=user)
        if user.is_cleaner or user.is_agency:
            if not user_is_eligible_evaluator(user):
                return queryset.none()
            return queryset.filter(cleaner=user)
        return queryset.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not user_is_eligible_evaluator(request.user):
            visible_owned_job = (
                request.user.is_host
                and request.user.is_active
                and request.user.is_approved
                and CleaningJob.objects.filter(
                    id=serializer.validated_data["job_id"],
                    host=request.user,
                ).exists()
            )
            if visible_owned_job or request.user.is_platform_admin:
                raise PermissionDenied("This account role cannot submit cleaner applications.")
            raise Http404

        job = get_object_or_404(
            application_jobs_for_user(
                request.user,
                CleaningJob.objects.select_related(
                    "property",
                    "property__service_zone__city",
                    "host",
                ),
            ),
            id=serializer.validated_data["job_id"],
        )
        try:
            application = submit_application(
                job=job,
                cleaner=request.user,
                proposed_price=serializer.validated_data.get("proposed_price"),
                message=serializer.validated_data.get("message", ""),
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Application submission blocked",
                extra={"event": "cleaner.apply_blocked_not_verified", "metadata": {"reason": str(exc)}},
            )
            return Response(
                {"detail": str(exc), "code": "application_not_allowed"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        response_serializer = WorkerCleanerApplicationSerializer(
            application,
            context={"request": request, "force_can_apply": False},
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        application = self.get_object()
        if not request.user.is_platform_admin and application.job.host_id != request.user.id:
            raise PermissionDenied("Only the job host or admin can accept this application.")
        try:
            assignment = accept_application(
                application=application,
                accepted_by=request.user,
                agreed_price=request.data.get("agreed_price"),
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Application accept blocked",
                extra={"event": "application.accept_blocked", "metadata": {"reason": str(exc)}},
            )
            return marketplace_error_response(exc)
        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()
        if not request.user.is_platform_admin and application.job.host_id != request.user.id:
            raise PermissionDenied("Only the job host or admin can reject this application.")
        try:
            application = reject_application(
                application=application,
                rejected_by=request.user,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Application reject blocked",
                extra={"event": "application.reject_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        application = self.get_object()
        if not request.user.is_platform_admin and application.cleaner_id != request.user.id:
            raise PermissionDenied("Only the applicant or admin can withdraw this application.")
        try:
            application = withdraw_application(
                application=application,
                withdrawn_by=request.user,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Application withdrawal blocked",
                extra={"event": "application.withdraw_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"], url_path="accept-offer")
    def accept_offer(self, request, pk=None):
        application = self.get_object()
        if not request.user.is_platform_admin and application.cleaner_id != request.user.id:
            raise PermissionDenied("Only the offered cleaner or admin can accept this offer.")
        try:
            assignment = accept_offer(
                application=application,
                cleaner=request.user,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Offer accept blocked",
                extra={"event": "offer.accept_blocked", "metadata": {"reason": str(exc)}},
            )
            return marketplace_error_response(exc)
        return Response(
            AssignedWorkerAssignmentSerializer(assignment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="decline-offer")
    def decline_offer(self, request, pk=None):
        application = self.get_object()
        if not request.user.is_platform_admin and application.cleaner_id != request.user.id:
            raise PermissionDenied("Only the offered cleaner or admin can decline this offer.")
        try:
            application = decline_offer(
                application=application,
                cleaner=request.user,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Offer decline blocked",
                extra={"event": "offer.decline_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(application).data)


class AssignmentViewSet(PrivateNoStoreResponseMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = AssignmentSerializer

    def get_serializer_class(self):
        if self.request.user.is_cleaner or self.request.user.is_agency:
            return AssignedWorkerAssignmentSerializer
        return AssignmentSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Assignment.objects.select_related(
            "job",
            "job__property",
            "job__property__service_zone__city",
            "cleaner",
            "cleaner__cleaner_profile",
            "assigned_member",
            "application",
            "job__host",
        )
        if user.is_platform_admin:
            return queryset
        if not user.is_active or not user.is_approved:
            return queryset.none()
        if user.is_host:
            return queryset.filter(job__host=user)
        if user.is_cleaner:
            if not user_is_eligible_evaluator(user):
                return queryset.none()
            return queryset.filter(Q(cleaner=user) | Q(assigned_member=user))
        if user.is_agency:
            if not user_is_eligible_evaluator(user):
                return queryset.none()
            return queryset.filter(cleaner=user)
        return queryset.none()

    @action(detail=True, methods=["post"], url_path="assign-member")
    def assign_member(self, request, pk=None):
        assignment = self.get_object()
        if not request.user.is_agency or assignment.cleaner_id != request.user.id:
            raise PermissionDenied("Only the assigned agency can delegate this cleaning.")
        serializer = AssignMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            member = User.objects.get(id=serializer.validated_data["assigned_member_id"])
        except User.DoesNotExist:
            return Response({"detail": "Cleaner account was not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            assignment = assign_member_to_assignment(
                assignment=assignment,
                agency_user=request.user,
                member=member,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Assignment member selection blocked",
                extra={"event": "assignment.member_assign_blocked", "metadata": {"reason": str(exc)}},
            )
            return marketplace_error_response(exc)
        return Response(self.get_serializer(assignment).data)


class FavouriteCleanerViewSet(viewsets.ModelViewSet):
    serializer_class = FavouriteCleanerSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        queryset = FavouriteCleaner.objects.select_related("cleaner", "cleaner__cleaner_profile")
        if user.is_platform_admin:
            return queryset
        return queryset.filter(host=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = self.request.user
        if not user.is_host:
            raise PermissionDenied("Only hosts can save favourite cleaners.")
        if not user.is_active or not user.is_approved:
            raise PermissionDenied("Account must be approved before saving favourites.")

        cleaner = serializer.validated_data["cleaner"]
        try:
            favourite, _ = create_favourite_cleaner(host=user, cleaner=cleaner)
        except MarketplaceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer.instance = favourite
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
