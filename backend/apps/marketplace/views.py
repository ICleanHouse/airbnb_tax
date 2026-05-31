from django.db.models import Q
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.marketplace.models import Assignment, CleanerApplication, CleaningBatch, CleaningJob
from apps.marketplace.serializers import (
    AssignMemberSerializer,
    AssignmentSerializer,
    CleanerApplicationSerializer,
    CleaningBatchSerializer,
    CleaningJobSerializer,
    MarketplaceCalendarItemSerializer,
)
from apps.marketplace.services import (
    MarketplaceError,
    accept_application,
    assign_member_to_assignment,
    complete_job,
    publish_job,
    reject_application,
    submit_application,
    withdraw_application,
)


User = get_user_model()


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
        "property_city": job.property.city,
        "property_neighborhood": job.property.neighborhood,
        "host_name": job.host.get_full_name() or job.host.get_username(),
        "job_status": job.status,
        "application_status": getattr(application, "status", ""),
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
    return (
        user.is_platform_admin
        or user.id == job.host_id
        or user.id == assignment.cleaner_id
        or user.id == assignment.assigned_member_id
    )


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
                CleaningJob.objects.select_related("property", "host", "assignment").all(),
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
                CleaningJob.objects.select_related("property", "host", "assignment").filter(host=user),
                start,
                end,
            )
            for job in jobs:
                assignment = get_job_assignment(job)
                item_type = "assignment" if assignment else "open_job"
                items.append(job_calendar_payload(job, item_type, user, assignment=assignment))
            serializer = MarketplaceCalendarItemSerializer(items, many=True)
            return Response(serializer.data)

        if user.is_cleaner:
            assignment_queryset = in_calendar_window(
                Assignment.objects.select_related("job", "job__property", "job__host", "application").filter(
                    Q(cleaner=user) | Q(assigned_member=user)
                ),
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
                .filter(cleaner=user)
                .exclude(status=CleanerApplication.Status.WITHDRAWN),
                start,
                end,
                "job__",
            ).exclude(job_id__in=assigned_job_ids)
            applied_job_ids = set()
            for application in application_queryset:
                applied_job_ids.add(application.job_id)
                items.append(job_calendar_payload(application.job, "application", user, application=application))

            open_jobs = in_calendar_window(
                CleaningJob.objects.select_related("property", "host")
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
                Assignment.objects.select_related("job", "job__property", "job__host", "application").filter(cleaner=user),
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
                .filter(cleaner=user)
                .exclude(status=CleanerApplication.Status.WITHDRAWN),
                start,
                end,
                "job__",
            ).exclude(job_id__in=assigned_job_ids)
            applied_job_ids = set()
            for application in application_queryset:
                applied_job_ids.add(application.job_id)
                items.append(job_calendar_payload(application.job, "application", user, application=application))

            open_jobs = in_calendar_window(
                CleaningJob.objects.select_related("property", "host")
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
            job = publish_job(self.get_object())
        except MarketplaceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        try:
            job = complete_job(job=self.get_object(), completed_by=request.user)
        except MarketplaceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(job).data)


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

    def perform_create(self, serializer):
        application = submit_application(
            job=serializer.validated_data["job"],
            cleaner=self.request.user,
            proposed_price=serializer.validated_data.get("proposed_price"),
            message=serializer.validated_data.get("message", ""),
        )
        serializer.instance = application

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        try:
            assignment = accept_application(
                application=self.get_object(),
                accepted_by=request.user,
                agreed_price=request.data.get("agreed_price"),
            )
        except MarketplaceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(AssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        try:
            application = reject_application(
                application=self.get_object(),
                rejected_by=request.user,
            )
        except MarketplaceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        try:
            application = withdraw_application(
                application=self.get_object(),
                withdrawn_by=request.user,
            )
        except MarketplaceError as exc:
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
            )
        except MarketplaceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(assignment).data)
