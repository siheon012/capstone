# Unmanned Store Action Timeline Extraction Agent

## Project Overview

This project is an anomaly detection agent for unmanned convenience stores that extracts action timelines from vision-based surveillance data. The system records all pre-anomalous behaviors of users in a database, allowing system administrators to query and retrieve timelines of incidents through natural language prompts. Administrators can easily discover what events occurred at specific times, providing comprehensive monitoring and security capabilities.

## Fast Start

### step 1

git clone this,

```bash
git clone https://github.com/siheon012/capstone.git
```

### step 2

Setup environment

```bash
# frontend
cd front
yarn install

# backend
cd ../back
python3 -m venv env  # make env
source ./env/bin/activate

# if you want to use my env,
pip install -r requirements.txt

# if you use development env, install setup.py
pip install -e .

# general installation,
pip install .
```

### step 3

Configure Django settings

```bash
cd back
touch .env
```

Create a `.env` file with the following configuration:

```
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost,your-server-ip

# Database configuration
DB_ENGINE=django.db.backends.postgresql
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
```

You can generate a Django secret key using:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### step 4

Setup the database

```bash
# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create a superuser (optional)
python manage.py createsuperuser
```

### step 5

Run the application

```bash
# run frontend
cd front
yarn dev

# run backend
cd back
python3 manage.py runserver
```
