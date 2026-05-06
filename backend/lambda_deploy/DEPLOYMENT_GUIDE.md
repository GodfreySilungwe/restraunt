# Lambda Deployment Package

This folder contains the complete deployment package for AWS Lambda.

## Structure

```
lambda_deploy/
├── app/                      # Flask application
│   ├── __init__.py           # Flask app factory and lambda_handler
│   ├── api.py                # API routes
│   ├── models.py             # DynamoDB models
│   ├── airtel_client.py      # Airtel Money integration
│   ├── static/               # Static files
│   └── templates/            # HTML templates
├── handler.py                # Lambda entry point
├── serverless_wsgi.py        # WSGI adapter
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variables template
├── .env                      # Environment variables (configure before deployment)
└── [dependencies]/           # All pip packages from requirements.txt
```

## Deployment Steps

### 1. Configure Environment Variables
```bash
# Copy and edit the .env file
cp .env.example .env
# Edit .env with your AWS credentials and configuration
```

### 2. Create Deployment Package
```bash
# From the backend folder, create the zip file
cd lambda_deploy
zip -r ../lambda-deployment.zip .
```

### 3. Deploy to AWS Lambda
```bash
# Using AWS CLI
aws lambda update-function-code \
  --function-name your-function-name \
  --zip-file fileb://../lambda-deployment.zip \
  --region us-east-1
```

### 4. Configure Lambda Environment Variables
Set the following environment variables in AWS Lambda console or via CLI:
- `AWS_REGION`: us-east-1
- `DYNAMODB_TABLE_NAME`: RestrauntTable
- `CORS_ORIGINS`: Your CloudFront distribution URL
- `ADMIN_SECRET`: Your admin secret
- `S3_BUCKET_NAME`: Your S3 bucket name
- `STRIPE_SECRET_KEY`: Your Stripe key
- `AIRTEL_API_KEY`: Your Airtel API key

### 5. Configure Lambda Handler
Set the Lambda handler to: `handler.lambda_handler`

### 6. Configure Lambda Timeout and Memory
- **Timeout**: 30 seconds (minimum)
- **Memory**: 512 MB (minimum recommended)

## API Gateway Integration

Configure API Gateway to proxy all requests to this Lambda function:
- Integration type: Lambda Function
- Lambda Function: Your function name
- Lambda Proxy integration: Enabled
- Binary media types: Add `*/*` to handle all content types

## Dependencies

All Python dependencies are packaged in this folder:
- Flask 2.3.3
- Flask-CORS 4.0.0
- boto3 1.34.0
- python-dotenv 1.0.0
- requests 2.31.0
- stripe 7.8.0
- serverless-wsgi 3.0.0

## Lambda Handler

The handler is defined as `handler.lambda_handler` and routes all requests through the Flask app using serverless-wsgi.

## DynamoDB Table Requirements

Ensure the DynamoDB table is created with:
- **Table Name**: RestrauntTable
- **Partition Key (PK)**: String
- **Sort Key (SK)**: String
- **Global Secondary Indexes**: GSI1-GSI6 (GSI1PK/GSI1SK, etc.)

## S3 Bucket Requirements

- Create an S3 bucket for image uploads
- Configure CORS for the bucket to allow API Gateway domain
- Set the bucket name in environment variables

## Troubleshooting

- **Missing environment variables**: Check Lambda environment variables configuration
- **DynamoDB errors**: Verify IAM role has DynamoDBFullAccess
- **CORS errors**: Check CORS_ORIGINS environment variable matches your frontend domain
- **File upload errors**: Verify S3 bucket exists and Lambda role has S3FullAccess

## Notes

- The `.env` file should not be committed to version control
- All dependencies are included in this package to avoid layer complexity
- The app uses single-table design in DynamoDB
