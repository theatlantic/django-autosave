from __future__ import absolute_import
import pkg_resources

try:
    __version__ = pkg_resources.get_distribution('django-autosave').version
except pkg_resources.DistributionNotFound:
    __version__ = None
