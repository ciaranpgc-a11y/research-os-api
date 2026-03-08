import os
import tempfile
from pathlib import Path
from research_os.db import User, create_all_tables, reset_database_state, session_scope
from research_os.services.data_planner_service import upload_library_assets, update_library_asset_access, list_library_assets, download_library_asset, PlannerValidationError

print('script-start', flush=True)
with tempfile.TemporaryDirectory() as tmp:
    os.environ['OPENAI_API_KEY'] = 'test-key'
    os.environ['DATABASE_URL'] = f"sqlite+pysqlite:///{Path(tmp)/'db.sqlite'}"
    os.environ['DATA_LIBRARY_ROOT'] = str(Path(tmp)/'data_library')
    reset_database_state()
    create_all_tables()
    print('tables-created', flush=True)
    with session_scope() as session:
        owner = User(email='owner@example.com', password_hash='x', name='Owner')
        viewer = User(email='viewer@example.com', password_hash='x', name='Viewer')
        session.add_all([owner, viewer])
        session.flush()
        owner_id = str(owner.id)
        viewer_id = str(viewer.id)
    print('users-created', flush=True)
    asset_id = upload_library_assets(files=[('a.csv','text/csv',b'a,b\n1,2\n')], user_id=owner_id)[0]
    print('uploaded', asset_id, flush=True)
    update_library_asset_access(asset_id=asset_id, user_id=owner_id, collaborators=[{'user_id': viewer_id, 'role': 'viewer'}])
    print('viewer-shared', flush=True)
    items = list_library_assets(project_id=None, user_id=viewer_id)['items']
    print('viewer-items', len(items), items[0]['current_user_role'], items[0]['can_download'], flush=True)
    try:
        download_library_asset(asset_id=asset_id, user_id=viewer_id)
    except PlannerValidationError as exc:
        print('download-blocked', str(exc), flush=True)
