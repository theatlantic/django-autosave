from distutils.core import setup

setup(
    name='Django Autosave',
    version="0.5.0",
    author='Jason Goldstein',
    author_email='jason@betheshoe.com',
    url='http://github.com/theatlantic/django-autosave',
    packages=['autosave', ],
    package_data={ 'autosave': ['static/*',] },
    description='Generic autsoave for the Django Admin.',
    long_description=open('README.markdown').read(),
)