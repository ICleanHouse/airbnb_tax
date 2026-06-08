from rest_framework import serializers

from apps.connections.models import Connection, Message


class ConnectionSerializer(serializers.ModelSerializer):
    """Connection as seen from the requesting user's perspective."""

    other_user_id = serializers.SerializerMethodField()
    other_user_name = serializers.SerializerMethodField()
    other_user_role = serializers.SerializerMethodField()
    other_user_image = serializers.SerializerMethodField()
    other_user_profile_id = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Connection
        fields = [
            "id",
            "status",
            "direction",
            "other_user_id",
            "other_user_name",
            "other_user_role",
            "other_user_image",
            "other_user_profile_id",
            "unread_count",
            "last_message",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def _me(self):
        return self.context["request"].user

    def _other(self, obj):
        return obj.other_user(self._me())

    def get_other_user_id(self, obj):
        return self._other(obj).id

    def get_other_user_name(self, obj):
        other = self._other(obj)
        return other.get_full_name() or other.get_username()

    def get_other_user_role(self, obj):
        return self._other(obj).role

    def get_other_user_image(self, obj):
        profile = getattr(self._other(obj), "cleaner_profile", None)
        return (getattr(profile, "profile_image", "") or "") or None

    def get_other_user_profile_id(self, obj):
        profile = getattr(self._other(obj), "cleaner_profile", None)
        return profile.id if profile else None

    def get_direction(self, obj):
        if obj.status == Connection.Status.ACCEPTED:
            return "connected"
        return "outgoing" if obj.requester_id == self._me().id else "incoming"

    def get_unread_count(self, obj):
        me = self._me()
        return sum(
            1 for m in obj.messages.all() if m.read_at is None and m.sender_id != me.id
        )

    def get_last_message(self, obj):
        messages = list(obj.messages.all())
        if not messages:
            return None
        last = max(messages, key=lambda m: m.created_at)
        return {
            "body": last.body,
            "created_at": last.created_at,
            "sender": last.sender_id,
        }


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "connection", "sender", "body", "read_at", "created_at"]
        read_only_fields = fields


class ConnectionRequestSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()


class SendMessageSerializer(serializers.Serializer):
    body = serializers.CharField()
