# Generated by Django 5.2 on 2025-06-07 10:15

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0009_auto_20250607_1009'),
    ]

    operations = [
        migrations.RenameField(
            model_name='promptsession',
            old_name='last_response',
            new_name='first_response',
        ),
    ]
