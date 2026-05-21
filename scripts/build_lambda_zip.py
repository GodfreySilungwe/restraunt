import zipfile
import os

root = 'lambda_deploy'
zip_name = 'lambda_deploy.zip'

with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            path = os.path.join(dirpath, fn)
            arcname = os.path.relpath(path, root)
            z.write(path, arcname)

print('Created', zip_name)
