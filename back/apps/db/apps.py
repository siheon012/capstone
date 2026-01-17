from django.apps import AppConfig


class DbConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.db"

    def ready(self):
        """앱 초기화 시 signals 등록"""
        import apps.db.signals  # noqa
