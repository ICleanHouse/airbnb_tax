from django.contrib import admin

from apps.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationDeliveryAttempt,
    NotificationEvent,
    OperatorNotificationAlert,
)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "notification_type", "channel", "title", "read_at", "sent_at", "created_at")
    list_filter = ("notification_type", "channel", "read_at", "sent_at")
    search_fields = ("user__username", "title", "body")


class ReadOnlyDeliveryAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)


@admin.register(NotificationEvent)
class NotificationEventAdmin(ReadOnlyDeliveryAdmin):
    list_display = ("id", "event_type", "recipient_id", "language", "source_entity_type", "source_entity_id", "created_at")
    list_filter = ("event_type", "language", "created_at")
    search_fields = ("=id", "=recipient_id", "=source_entity_id", "=deduplication_key")


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(ReadOnlyDeliveryAdmin):
    list_display = ("id", "event_type", "channel", "status", "attempt_count", "error_category", "last_attempted_at", "created_at")
    list_filter = ("status", "channel", "error_category", "created_at")
    search_fields = ("=id", "=event_id", "=event__source_entity_id", "=deduplication_key")

    @admin.display(ordering="event__event_type")
    def event_type(self, obj):
        return obj.event.event_type

    @admin.display(ordering="event__source_entity_id")
    def source_id(self, obj):
        return obj.event.source_entity_id


@admin.register(NotificationDeliveryAttempt)
class NotificationDeliveryAttemptAdmin(ReadOnlyDeliveryAdmin):
    list_display = ("id", "delivery_id", "attempt_number", "status", "error_category", "error_code", "started_at", "finished_at")
    list_filter = ("status", "error_category", "started_at")
    search_fields = ("=id", "=delivery_id")


@admin.register(OperatorNotificationAlert)
class OperatorNotificationAlertAdmin(ReadOnlyDeliveryAdmin):
    list_display = ("id", "delivery_id", "alert_code", "created_at", "acknowledged_at")
    list_filter = ("alert_code", "acknowledged_at", "created_at")
    search_fields = ("=id", "=delivery_id")
