import pytest
from .models import MyModel


@pytest.mark.django_db
def test_smoke(admin_client):
    my = MyModel.objects.create(name='name')
    rsp = admin_client.get(f'/admin/tests/mymodel/{my.id}/change/')
    assert rsp.status_code == 200

    html = rsp.content.decode()
    assert f'src="/admin/tests/mymodel/{my.id}/autosave_variables.js' in html
    assert f'src="/static/autosave/js/autosave.js' in html

    rsp = admin_client.get(f'/admin/tests/mymodel/{my.id}/autosave_variables.js')
    assert rsp.status_code == 200
    assert b'var DjangoAutosave' in rsp.content
