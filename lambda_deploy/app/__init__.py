import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config['JSON_SORT_KEYS'] = False

    # Enable CORS for all routes - allow CloudFront origins and localhost for development
    cors_origins_env = os.getenv('CORS_ORIGINS', '')
    if cors_origins_env:
        cors_origins = [origin.strip() for origin in cors_origins_env.split(',') if origin.strip()]
    else:
        # Default to allowing localhost and common dev ports for development
        cors_origins = [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:8080',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:8080',
        ]
    
    # Add CloudFront origin if configured
    cloudfront_origin = os.getenv('CLOUDFRONT_ORIGIN')
    if cloudfront_origin:
        cors_origins.append(cloudfront_origin.strip())
    
    print(f"[INFO] CORS origins configured: {cors_origins}")
    
    CORS(app, 
         resources={r"/api/*": {
             "origins": cors_origins,
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
             "allow_headers": ["Content-Type", "X-Admin-Secret"],
             "supports_credentials": False,
             "max_age": 3600
         }},
         send_wildcard=False,
         vary_header=True
    )

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
