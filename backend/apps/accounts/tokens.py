from django.contrib.auth.tokens import PasswordResetTokenGenerator


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp):
        verified_at = "" if user.email_verified_at is None else user.email_verified_at.isoformat()
        return f"{user.pk}{timestamp}{user.email}{verified_at}"


email_verification_token = EmailVerificationTokenGenerator()
