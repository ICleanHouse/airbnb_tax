from django.contrib import admin

from apps.marketplace.models import (
    Assignment,
    CleanerApplication,
    CleaningBatch,
    CleaningJob,
    JobLifecycleEvent,
    TurnoverLineage,
)


class CleaningJobChronologyInline(admin.TabularInline):
    model = CleaningJob
    extra = 0
    can_delete = False
    fields = (
        "id",
        "replaces_job",
        "title",
        "scheduled_start",
        "scheduled_end",
        "status",
        "published_at",
        "cancelled_at",
        "cancellation_reason_code",
    )
    readonly_fields = fields
    show_change_link = True


class JobLifecycleEventInline(admin.TabularInline):
    model = JobLifecycleEvent
    extra = 0
    can_delete = False
    fields = (
        "occurred_at",
        "job",
        "event_type",
        "from_status",
        "to_status",
        "reason_code",
        "actor_role_snapshot",
        "audience",
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(CleaningBatch)
class CleaningBatchAdmin(admin.ModelAdmin):
    list_display = ("title", "property", "host", "month", "status")
    list_filter = ("status", "month")
    search_fields = ("title", "property__name", "host__username")


@admin.register(CleaningJob)
class CleaningJobAdmin(admin.ModelAdmin):
    list_display = ("title", "property", "host", "scheduled_start", "status", "proposed_price", "agreed_price")
    list_filter = ("status", "currency", "property__city")
    search_fields = ("title", "property__name", "host__username")
    readonly_fields = (
        "lineage",
        "replaces_job",
        "property",
        "host",
        "scheduled_start",
        "scheduled_end",
        "status",
        "published_at",
        "cancelled_at",
        "cancelled_by",
        "cancellation_reason_code",
        "cancellation_note",
        "cancellation_notice_band",
        "created_at",
        "updated_at",
    )
    inlines = (JobLifecycleEventInline,)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TurnoverLineage)
class TurnoverLineageAdmin(admin.ModelAdmin):
    list_display = ("id", "property", "host", "created_at")
    search_fields = ("property__name", "host__username")
    readonly_fields = ("property", "host", "created_at", "updated_at")
    inlines = (CleaningJobChronologyInline, JobLifecycleEventInline)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(JobLifecycleEvent)
class JobLifecycleEventAdmin(admin.ModelAdmin):
    list_display = ("event_type", "job", "lineage", "occurred_at", "audience")
    list_filter = ("event_type", "audience")
    search_fields = ("job__title", "lineage__property__name")
    readonly_fields = tuple(field.name for field in JobLifecycleEvent._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.method in {"GET", "HEAD"}

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CleanerApplication)
class CleanerApplicationAdmin(admin.ModelAdmin):
    list_display = ("job", "cleaner", "status", "proposed_price", "created_at")
    list_filter = ("status",)
    search_fields = ("job__title", "cleaner__username")


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ("job", "cleaner", "agreed_price", "assigned_at", "completed_at", "cancelled_at")
    search_fields = ("job__title", "cleaner__username")
    readonly_fields = tuple(field.name for field in Assignment._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
