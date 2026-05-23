import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['JSON_SORT_KEYS'] = False

    # Enable CORS for all routes - allow CloudFront origins
    cors_origins = os.getenv('CORS_ORIGINS', 'https://your-cloudfront-distribution.cloudfront.net').split(',')
    CORS(app, resources={r"/api/*": {"origins": cors_origins}})

    # Create the DynamoDB table only when the app starts, not on import
    from .models import ensure_table_exists
    ensure_table_exists()

    # register blueprints
    from .api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    return app

# Lambda handler for API Gateway
def lambda_handler(event, context):
    from serverless_wsgi import handle_request
    return handle_request(create_app(), event, context)
