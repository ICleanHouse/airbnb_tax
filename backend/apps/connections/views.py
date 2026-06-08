from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.marketplace.models import Assignment

from apps.connections import services
from apps.connections.models import Connection, Message
from apps.connections.serializers import (
    ConnectionRequestSerializer,
    ConnectionSerializer,
    MessageSerializer,
    SendMessageSerializer,
)


User = get_user_model()


class ConnectionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ConnectionSerializer
    http_method_names = ["get", "post", "delete"]

    def get_queryset(self):
        user = self.request.user
        return (
            Connection.objects.filter(Q(requester=user) | Q(addressee=user))
            .exclude(status__in=[Connection.Status.DECLINED, Connection.Status.REMOVED])
            .select_related("requester", "addressee")
            .prefetch_related("messages")
        )

    # ── Create (send a request) ────────────────────────────────────────────
    def create(self, request, *args, **kwargs):
        serializer = ConnectionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            addressee = User.objects.get(id=serializer.validated_data["user_id"])
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            connection = services.request_connection(
                requester=request.user, addressee=addressee, request=request
            )
        except services.ConnectionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            ConnectionSerializer(connection, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        connection = self.get_object()
        try:
            services.remove_connection(connection=connection, user=request.user, request=request)
        except services.ConnectionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        try:
            connection = services.accept_connection(
                connection=self.get_object(), user=request.user, request=request
            )
        except services.ConnectionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ConnectionSerializer(connection, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        try:
            connection = services.decline_connection(
                connection=self.get_object(), user=request.user, request=request
            )
        except services.ConnectionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(ConnectionSerializer(connection, context=self.get_serializer_context()).data)

    # ── Messages (GET list + mark read, POST send) ─────────────────────────
    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        connection = self.get_object()
        if not connection.involves(request.user):
            raise PermissionDenied("You are not part of this connection.")

        if request.method == "POST":
            serializer = SendMessageSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            try:
                message = services.send_message(
                    connection=connection,
                    sender=request.user,
                    body=serializer.validated_data["body"],
                    request=request,
                )
            except services.ConnectionError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)

        services.mark_messages_read(connection=connection, reader=request.user)
        messages = connection.messages.select_related("sender").all()
        return Response(MessageSerializer(messages, many=True).data)

    @action(detail=True, methods=["post"], url_path="read")
    def read(self, request, pk=None):
        connection = self.get_object()
        if not connection.involves(request.user):
            raise PermissionDenied("You are not part of this connection.")
        count = services.mark_messages_read(connection=connection, reader=request.user)
        return Response({"marked_read": count})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        user = request.user
        accepted = self.get_queryset().filter(status=Connection.Status.ACCEPTED)
        unread = (
            Message.objects.filter(connection__in=accepted, read_at__isnull=True)
            .exclude(sender=user)
            .count()
        )
        pending = self.get_queryset().filter(
            status=Connection.Status.PENDING, addressee=user
        ).count()
        return Response({"unread": unread, "pending_requests": pending})

    @action(detail=True, methods=["get"], url_path="shared")
    def shared(self, request, pk=None):
        connection = self.get_object()
        if not connection.involves(request.user):
            raise PermissionDenied("You are not part of this connection.")

        a, b = connection.requester, connection.addressee
        host = a if a.is_host else b
        worker = b if a.is_host else a

        assignments = (
            Assignment.objects.filter(job__host=host)
            .filter(Q(cleaner=worker) | Q(assigned_member=worker))
            .select_related("job", "job__property")
            .order_by("-job__scheduled_start")
        )

        cleanings = []
        properties: dict[int, dict] = {}
        for asgn in assignments:
            job = asgn.job
            prop = job.property
            cleanings.append(
                {
                    "job_id": job.id,
                    "title": job.title,
                    "property_id": prop.id,
                    "property_name": prop.name,
                    "scheduled_start": job.scheduled_start,
                    "status": job.status,
                    "agreed_price": asgn.agreed_price,
                    "currency": job.currency,
                    "completed_at": asgn.completed_at,
                }
            )
            entry = properties.setdefault(
                prop.id, {"id": prop.id, "name": prop.name, "city": prop.city, "cleanings": 0}
            )
            entry["cleanings"] += 1

        return Response(
            {
                "properties": list(properties.values()),
                "cleanings": cleanings,
                "cleanings_count": len(cleanings),
            }
        )
