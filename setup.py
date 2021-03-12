#!/usr/bin/env python

from __future__ import absolute_import
from setuptools import setup, find_packages

import autosave

setup(
    name="Django Autosave",
    version='2.1.0',
    author='The Atlantic',
    author_email='programmers@theatlantic.com',
    url='https://github.com/theatlantic/django-autosave',
    packages=['autosave'],
    description='Generic autosave for the Django Admin.',
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',
    install_requires=['Django>=2.0'],
    python_requires='>=3.7,<4',
    classifiers=[
        'Development Status :: 5 - Production',
        'License :: OSI Approved :: BSD License',
        'Environment :: Web Environment',
        'Intended Audience :: Developers',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Framework :: Django',
        'Framework :: Django :: 2.2',
        'Framework :: Django :: 3.0',
        'Framework :: Django :: 3.1',
        'Framework :: Django :: 3.2',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.7',
        'Programming Language :: Python :: 3.8',
    ],
    include_package_data=True,
    zip_safe=False,
)
