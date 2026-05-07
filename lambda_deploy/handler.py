import sys
import os
from serverless_wsgi import handle_request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import create_app

app = create_app()

def lambda_handler(event, context):
    return handle_request(app, event, context)
