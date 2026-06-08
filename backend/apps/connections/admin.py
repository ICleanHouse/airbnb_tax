from django.contrib import admin

from apps.connections.models import Connection, Message


@admin.register(Connection)
class ConnectionAdmin(admin.ModelAdmin):
    list_display = ("id", "requester", "addressee", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("requester__username", "addressee__username")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "connection", "sender", "read_at", "created_at")
    list_filter = ("read_at",)
