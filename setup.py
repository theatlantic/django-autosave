#!/usr/bin/env python

from __future__ import absolute_import
from setuptools import setup, find_packages

setup(
    name="Django Autosave",
    version="1.0.0",
    author='Jason Goldstein',
    author_email='jason@betheshoe.com',
    url='https://github.com/theatlantic/django-autosave',
    packages=['autosave'],
    description='Generic autosave for the Django Admin.',
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',
    install_requires=['Django>=1.11'],
    python_requires='>=2.7, !=3.0.*, !=3.1.*, !=3.2.*, !=3.3.*, !=3.4.*, <4',
    classifiers=[
        'Development Status :: 5 - Production',
        'License :: OSI Approved :: BSD License',
        'Environment :: Web Environment',
        'Intended Audience :: Developers',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Framework :: Django',
        'Framework :: Django :: 1.11',
        'Framework :: Django :: 2.0',
        'Framework :: Django :: 2.1',
        'Programming Language :: Python :: 2',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.5',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
    ],
    include_package_data=True,
    zip_safe=False,
)
