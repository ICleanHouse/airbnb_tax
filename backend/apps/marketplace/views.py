import logging
from datetime import timedelta

from django.db.models import Q
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.core.services import write_audit_log
from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningBatch,
    CleaningJob,
    FavouriteCleaner,
)
from apps.marketplace.serializers import (
    AssignMemberSerializer,
    AssignmentSerializer,
    CleanerApplicationSerializer,
    CleaningBatchSerializer,
    CleaningJobSerializer,
    FavouriteCleanerSerializer,
    MarketplaceCalendarItemSerializer,
    OpenJobLocationSerializer,
    OfferJobSerializer,
    OfferToCleanerSerializer,
)
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    accept_offer,
    assign_member_to_assignment,
    complete_job,
    decline_offer,
    offer_job,
    offer_job_to_cleaner,
    publish_job,
    reject_application,
    submit_application,
    withdraw_application,
)


User = get_user_model()
logger = logging.getLogger("apps.marketplace")


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
    completed_at = getattr(assignment, "completed_at", None)
    price = job.agreed_price or job.proposed_price
    if application is not None:
        price = application.proposed_price or price
    if assignment is not None:
        price = assignment.agreed_price or price

    first_image = min(
        job.property.images.all(),
        key=lambda img: (img.order, img.id),
        default=None,
    )

    return {
        "id": f"{item_type}:{job.id}:{getattr(application, 'id', '') or getattr(assignment, 'id', '') or job.id}",
        "item_type": item_type,
        "job": job.id,
        "application": getattr(application, "id", None),
        "assignment": getattr(assignment, "id", None),
        "title": job.title,
        "starts_at": job.scheduled_start,
        "ends_at": job.scheduled_end,
        "currency": job.currency,
        "price": price,
        "property_name": job.property.name,
        "property_image": first_image.image.url if first_image else None,
        "property_city": job.property.city,
        "property_neighborhood": job.property.neighborhood,
        "host_name": job.host.get_full_name() or job.host.get_username(),
        "job_status": job.status,
        "application_status": getattr(application, "status", ""),
        "application_origin": getattr(application, "origin", ""),
        "host_completed_at": getattr(assignment, "host_completed_at", None),
        "cleaner_completed_at": getattr(assignment, "cleaner_completed_at", None),
        "completed_at": completed_at,
        "can_apply": item_type == "open_job" and job.status == CleaningJob.Status.OPEN and user_can_apply_to_calendar_job(user),
        "can_complete": user_can_complete_calendar_assignment(user, assignment, job),
    }


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
        if not user.is_approved:
            return queryset.none()
        if user.is_host:
            return queryset.filter(host=user)
        if user.is_cleaner:
            return queryset.filter(
                Q(status=CleaningJob.Status.OPEN)
                | Q(assignment__cleaner=user)
                | Q(assignment__assigned_member=user)
            ).distinct()
        if user.is_agency:
            return queryset.filter(Q(status=CleaningJob.Status.OPEN) | Q(assignment__cleaner=user)).distinct()
        return queryset.none()


class MarketplaceCalendarView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if not user.is_approved:
            return Response([])

        start = parse_calendar_bound(request.query_params.get("start"))
        end = parse_calendar_bound(request.query_params.get("end"))
        items = []

        if user.is_platform_admin:
            jobs = in_calendar_window(
                CleaningJob.objects.select_related("property", "host", "assignment")
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
                CleaningJob.objects.select_related("property", "host", "assignment")
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

        if user.is_cleaner:
            assignment_queryset = in_calendar_window(
                Assignment.objects.select_related("job", "job__property", "job__host", "application")
                .prefetch_related("job__property__images")
                .filter(Q(cleaner=user) | Q(assigned_member=user)),
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
                CleanerApplication.objects.select_related("job", "job__property", "job__host")
                .prefetch_related("job__property__images")
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
                CleaningJob.objects.select_related("property", "host")
                .prefetch_related("property__images")
                .filter(status=CleaningJob.Status.OPEN)
                .exclude(id__in=assigned_job_ids | applied_job_ids),
                start,
                end,
            )
            for job in open_jobs:
                items.append(job_calendar_payload(job, "open_job", user))

            serializer = MarketplaceCalendarItemSerializer(items, many=True)
            return Response(serializer.data)

        if user.is_agency:
            assignment_queryset = in_calendar_window(
                Assignment.objects.select_related("job", "job__property", "job__host", "application")
                .prefetch_related("job__property__images")
                .filter(cleaner=user),
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
                CleanerApplication.objects.select_related("job", "job__property", "job__host")
                .prefetch_related("job__property__images")
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
                CleaningJob.objects.select_related("property", "host")
                .prefetch_related("property__images")
                .filter(status=CleaningJob.Status.OPEN)
                .exclude(id__in=assigned_job_ids | applied_job_ids),
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

    GET /api/marketplace/area-stats/?city=Sofia
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from apps.accounts.models import CleanerProfile, HostProfile

        city = (request.query_params.get("city") or "").strip()
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
        open_jobs = CleaningJob.objects.filter(status=CleaningJob.Status.OPEN)

        if city:
            cleaners = cleaners.filter(city__iexact=city)
            hosts = hosts.filter(city__iexact=city)
            open_jobs = open_jobs.filter(property__city__iexact=city)

        return Response(
            {
                "city": city,
                "verified_cleaners": cleaners.count(),
                "active_hosts": hosts.count(),
                "open_jobs": open_jobs.count(),
                "jobs_this_week": open_jobs.filter(created_at__gte=week_ago).count(),
                "jobs_this_month": open_jobs.filter(created_at__gte=month_ago).count(),
            }
        )


class OpenJobLocationsView(views.APIView):
    """
    Public map markers for published cleaning work.

    Returns open-job property locations only, with no host identity or account
    details. An optional ?city= narrows markers to the selected landing area.

    GET /api/marketplace/open-job-locations/?city=Sofia
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        city = (request.query_params.get("city") or "").strip()
        jobs = (
            CleaningJob.objects.select_related("property")
            .prefetch_related("property__images")
            .filter(
                status=CleaningJob.Status.OPEN,
                host__account_status=User.AccountStatus.APPROVED,
                host__is_active=True,
                property__latitude__isnull=False,
                property__longitude__isnull=False,
            )
            .order_by("scheduled_start", "id")
        )
        if city:
            jobs = jobs.filter(property__city__iexact=city)

        serializer = OpenJobLocationSerializer(jobs, many=True)
        return Response(serializer.data)


class CleaningBatchViewSet(viewsets.ModelViewSet):
    serializer_class = CleaningBatchSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = CleaningBatch.objects.select_related("property", "host")
        if user.is_platform_admin:
            return queryset
        return queryset.filter(host=user)

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


class CleaningJobViewSet(MarketplaceQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = CleaningJobSerializer

    def get_queryset(self):
        queryset = CleaningJob.objects.select_related("property", "host", "batch").prefetch_related(
            "applications"
        )
        queryset = self.filter_for_user(queryset)
        city = self.request.query_params.get("city", "").strip()
        neighborhood = self.request.query_params.get("neighborhood", "").strip()
        if city:
            queryset = queryset.filter(property__city__iexact=city)
        if neighborhood:
            queryset = queryset.filter(property__neighborhood__icontains=neighborhood)
        return queryset

    def perform_create(self, serializer):
        property = serializer.validated_data["property"]
        if not (self.request.user.is_platform_admin or self.request.user.is_host):
            raise PermissionDenied("Only hosts can create cleaning jobs.")
        if not self.request.user.is_platform_admin and not self.request.user.is_approved:
            raise PermissionDenied("Account must be approved before creating cleaning jobs.")
        if not self.request.user.is_platform_admin and property.host_id != self.request.user.id:
            raise PermissionDenied("Hosts can create jobs only for their own properties.")
        serializer.save(host=property.host)

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
        if instance.status != CleaningJob.Status.DRAFT:
            return Response(
                {"detail": "Only draft jobs can be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status not in (CleaningJob.Status.DRAFT, CleaningJob.Status.OPEN):
            return Response(
                {"detail": "Only draft or open jobs can be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        if not request.user.is_platform_admin and not request.user.is_approved:
            raise PermissionDenied("Account must be approved before publishing jobs.")
        try:
            job = publish_job(self.get_object(), actor=request.user, request=request)
        except MarketplaceError as exc:
            logger.warning(
                "Job publish blocked",
                extra={"event": "host.publish_job_denied", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        try:
            job = complete_job(job=self.get_object(), completed_by=request.user, request=request)
        except MarketplaceError as exc:
            logger.warning(
                "Job completion blocked",
                extra={"event": "job.complete_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def offer(self, request, pk=None):
        serializer = OfferJobSerializer(data={**request.data, "job_id": self.get_object().id})
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
        if not request.user.is_platform_admin and not request.user.is_approved:
            raise PermissionDenied("Account must be approved before offering jobs.")
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


class CleanerApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = CleanerApplicationSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = CleanerApplication.objects.select_related("job", "cleaner", "job__host", "job__property")
        if user.is_platform_admin:
            return queryset
        if not user.is_approved:
            return queryset.none()
        if user.is_host:
            return queryset.filter(job__host=user)
        if user.is_cleaner or user.is_agency:
            return queryset.filter(cleaner=user)
        return queryset.none()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
        except MarketplaceError as exc:
            logger.warning(
                "Application submission blocked",
                extra={"event": "cleaner.apply_blocked_not_verified", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        application = submit_application(
            job=serializer.validated_data["job"],
            cleaner=self.request.user,
            proposed_price=serializer.validated_data.get("proposed_price"),
            message=serializer.validated_data.get("message", ""),
            request=self.request,
        )
        serializer.instance = application

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        try:
            assignment = accept_application(
                application=self.get_object(),
                accepted_by=request.user,
                agreed_price=request.data.get("agreed_price"),
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Application accept blocked",
                extra={"event": "application.accept_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        try:
            application = reject_application(
                application=self.get_object(),
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
        try:
            application = withdraw_application(
                application=self.get_object(),
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
        try:
            assignment = accept_offer(
                application=self.get_object(),
                cleaner=request.user,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Offer accept blocked",
                extra={"event": "offer.accept_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="decline-offer")
    def decline_offer(self, request, pk=None):
        try:
            application = decline_offer(
                application=self.get_object(),
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


class AssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Assignment.objects.select_related("job", "job__property", "cleaner", "application", "job__host")
        if user.is_platform_admin:
            return queryset
        if not user.is_approved:
            return queryset.none()
        if user.is_host:
            return queryset.filter(job__host=user)
        if user.is_cleaner:
            return queryset.filter(Q(cleaner=user) | Q(assigned_member=user))
        if user.is_agency:
            return queryset.filter(cleaner=user)
        return queryset.none()

    @action(detail=True, methods=["post"], url_path="assign-member")
    def assign_member(self, request, pk=None):
        serializer = AssignMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            member = User.objects.get(id=serializer.validated_data["assigned_member_id"])
        except User.DoesNotExist:
            return Response({"detail": "Cleaner account was not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            assignment = assign_member_to_assignment(
                assignment=self.get_object(),
                agency_user=request.user,
                member=member,
                request=request,
            )
        except MarketplaceError as exc:
            logger.warning(
                "Assignment member selection blocked",
                extra={"event": "assignment.member_assign_blocked", "metadata": {"reason": str(exc)}},
            )
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
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

    def perform_create(self, serializer):
        user = self.request.user
        if not (user.is_platform_admin or user.is_host):
            raise PermissionDenied("Only hosts can save favourite cleaners.")
        if not user.is_platform_admin and not user.is_approved:
            raise PermissionDenied("Account must be approved before saving favourites.")
        cleaner = serializer.validated_data["cleaner"]
        if not (cleaner.is_cleaner or cleaner.is_agency):
            raise PermissionDenied("Only cleaner or agency accounts can be favourited.")
        favourite, _ = FavouriteCleaner.objects.get_or_create(host=user, cleaner=cleaner)
        serializer.instance = favourite
