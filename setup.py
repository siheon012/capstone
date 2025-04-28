from setuptools import setup, find_packages

setup(
    name='CCTV',
    version='0.1.0',
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        'Django>=5.0',
        'djangorestframework>=3.14',
    ],
    python_requires='>=3.10,<3.12',
)
