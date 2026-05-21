import os
import boto3
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Any
import json
from boto3.dynamodb.conditions import Attr, Key

def _aws_credentials():
    access_key = os.getenv('AWS_ACCESS_KEY_ID')
    secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
    session_token = os.getenv('AWS_SESSION_TOKEN')
    creds = {}
    if access_key and secret_key:
        creds['aws_access_key_id'] = access_key
        creds['aws_secret_access_key'] = secret_key
        if session_token:
            creds['aws_session_token'] = session_token
    return creds

# DynamoDB setup
aws_options = {
    'region_name': os.getenv('AWS_REGION', 'us-east-1')
}
aws_options.update(_aws_credentials())

dynamodb = boto3.resource('dynamodb', **aws_options)
TABLE_NAME = os.getenv('DYNAMODB_TABLE_NAME', 'RestrauntTable')
table = dynamodb.Table(TABLE_NAME)

def ensure_table_exists():
    """Create DynamoDB table if it doesn't exist."""
    global table
    
    try:
        table.meta.client.describe_table(TableName=TABLE_NAME)
        print(f"Table {TABLE_NAME} already exists.")
    except table.meta.client.exceptions.ResourceNotFoundException:
        print(f"Creating table {TABLE_NAME}...")
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {
                    'AttributeName': 'PK',
                    'KeyType': 'HASH'
                },
                {
                    'AttributeName': 'SK',
                    'KeyType': 'RANGE'
                }
            ],
            AttributeDefinitions=[
                {'AttributeName': 'PK', 'AttributeType': 'S'},
                {'AttributeName': 'SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI1PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI1SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI2PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI2SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI3PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI3SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI4PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI4SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI5PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI5SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI6PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI6SK', 'AttributeType': 'S'}
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'GSI1',
                    'KeySchema': [
                        {'AttributeName': 'GSI1PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI1SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'GSI2',
                    'KeySchema': [
                        {'AttributeName': 'GSI2PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI2SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'GSI3',
                    'KeySchema': [
                        {'AttributeName': 'GSI3PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI3SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'GSI4',
                    'KeySchema': [
                        {'AttributeName': 'GSI4PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI4SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'GSI5',
                    'KeySchema': [
                        {'AttributeName': 'GSI5PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI5SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                },
                {
                    'IndexName': 'GSI6',
                    'KeySchema': [
                        {'AttributeName': 'GSI6PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI6SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'}
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        
        print(f"Waiting for table {TABLE_NAME} to be created...")
        table.meta.client.get_waiter('table_exists').wait(TableName=TABLE_NAME)
        print(f"Table {TABLE_NAME} created successfully!")
        table = dynamodb.Table(TABLE_NAME)

# S3 setup for file storage
aws_options = {
    'region_name': os.getenv('AWS_REGION', 'us-east-1')
}
aws_options.update(_aws_credentials())

s3_client = boto3.client('s3', **aws_options)
S3_BUCKET = os.getenv('S3_BUCKET_NAME', 'online-shop-bucket')

class DynamoDBModel:
    @staticmethod
    def put_item(item: Dict[str, Any]) -> None:
        """Put an item into DynamoDB, converting datetime to string."""
        processed_item = DynamoDBModel._process_item_for_dynamodb(item)
        table.put_item(Item=processed_item)

    @staticmethod
    def get_item(pk: str, sk: str) -> Optional[Dict[str, Any]]:
        """Get an item from DynamoDB."""
        response = table.get_item(Key={'PK': pk, 'SK': sk})
        item = response.get('Item')
        if item:
            return DynamoDBModel._process_item_from_dynamodb(item)
        return None

    @staticmethod
    def query_by_prefix(pk_prefix: str, sk_prefix: str = None) -> List[Dict[str, Any]]:
        """Query items by partition key prefix, optionally with sort key prefix."""
        key_condition = Key('PK').begins_with(pk_prefix)
        if sk_prefix:
            key_condition &= Key('SK').begins_with(sk_prefix)

        try:
            response = table.query(KeyConditionExpression=key_condition)
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] DynamoDBModel.query_by_prefix: {str(e)}")
            return []

    @staticmethod
    def scan(filter_expression=None) -> List[Dict[str, Any]]:
        """Scan table with optional filter."""
        if filter_expression:
            response = table.scan(FilterExpression=filter_expression)
        else:
            response = table.scan()
        items = response.get('Items', [])
        return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]

    @staticmethod
    def update_item(pk: str, sk: str, update_expression: str, expression_attribute_values: Dict[str, Any],
                   expression_attribute_names: Dict[str, str] = None) -> None:
        """Update an item in DynamoDB."""
        update_params = {
            'Key': {'PK': pk, 'SK': sk},
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': DynamoDBModel._process_item_for_dynamodb(expression_attribute_values)
        }
        if expression_attribute_names:
            update_params['ExpressionAttributeNames'] = expression_attribute_names
        table.update_item(**update_params)

    @staticmethod
    def delete_item(pk: str, sk: str) -> None:
        """Delete an item from DynamoDB."""
        table.delete_item(Key={'PK': pk, 'SK': sk})

    @staticmethod
    def _process_item_for_dynamodb(item: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Python types to DynamoDB compatible types."""
        processed = {}
        for key, value in item.items():
            if isinstance(value, datetime):
                processed[key] = value.isoformat()
            elif isinstance(value, bool):
                processed[key] = value
            elif isinstance(value, (int, float)):
                processed[key] = Decimal(str(value))
            elif isinstance(value, dict):
                processed[key] = DynamoDBModel._process_item_for_dynamodb(value)
            elif isinstance(value, list):
                processed[key] = [DynamoDBModel._process_item_for_dynamodb({'item': v})['item'] if isinstance(v, dict) else v for v in value]
            else:
                processed[key] = str(value) if value is not None else None
        return processed

    @staticmethod
    def _process_item_from_dynamodb(item: Dict[str, Any]) -> Dict[str, Any]:
        """Convert DynamoDB types back to Python types."""
        processed = {}
        for key, value in item.items():
            if isinstance(value, Decimal):
                if '.' not in str(value):
                    processed[key] = int(value)
                else:
                    processed[key] = float(value)
            elif isinstance(value, str):
                try:
                    datetime.fromisoformat(value)
                    processed[key] = value
                except:
                    processed[key] = value
            elif isinstance(value, dict):
                processed[key] = DynamoDBModel._process_item_from_dynamodb(value)
            elif isinstance(value, list):
                processed[key] = [DynamoDBModel._process_item_from_dynamodb({'item': v})['item'] if isinstance(v, dict) else v for v in value]
            else:
                processed[key] = value
        return processed

# Entity classes for single-table design
class Category:
    @staticmethod
    def create(name: str, position: int = 0) -> Dict[str, Any]:
        import uuid
        category_id = str(uuid.uuid4())
        item = {
            'PK': f'CATEGORY#{category_id}',
            'SK': f'CATEGORY#{category_id}',
            'entity_type': 'category',
            'id': category_id,
            'name': name,
            'position': position,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all categories using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('category')
            )
            items = response.get('Items', [])
            
            # Sort by position
            items.sort(key=lambda x: int(x.get('position', 0)))
            
            return [{
                'id': item.get('id'),
                'name': item.get('name'),
                'position': int(item.get('position', 0))
            } for item in items]
        except Exception as e:
            print(f"[ERROR] Category.get_all: {str(e)}")
            return []

    @staticmethod
    def get_by_id(category_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'CATEGORY#{category_id}', f'CATEGORY#{category_id}')

    @staticmethod
    def update(category_id: str, name: str = None, position: int = None) -> None:
        """Update category attributes."""
        update_expr = "SET "
        attr_values = {}
        attr_names = {}
        
        if name is not None:
            update_expr += "#name = :name, "
            attr_values[':name'] = name
            attr_names['#name'] = 'name'
        if position is not None:
            update_expr += "#position = :position, "
            attr_values[':position'] = position
            attr_names['#position'] = 'position'
        
        update_expr = update_expr.rstrip(', ')
        DynamoDBModel.update_item(
            f'CATEGORY#{category_id}', f'CATEGORY#{category_id}',
            update_expr, attr_values, attr_names if attr_names else None
        )

    @staticmethod
    def delete(category_id: str) -> None:
        DynamoDBModel.delete_item(f'CATEGORY#{category_id}', f'CATEGORY#{category_id}')

class MenuItem:
    @staticmethod
    def create(name: str, description: str, price_cents: int, category_id: str, available: bool = True, image_filename: str = None) -> Dict[str, Any]:
        import uuid
        item_id = str(uuid.uuid4())
        item = {
            'PK': f'MENUITEM#{item_id}',
            'SK': f'MENUITEM#{item_id}',
            'GSI1PK': f'CATEGORY#{category_id}',
            'GSI1SK': f'MENUITEM#{item_id}',
            'entity_type': 'menuitem',
            'id': item_id,
            'name': name,
            'description': description,
            'price_cents': price_cents,
            'available': available,
            'category_id': category_id,
            'image_filename': image_filename,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all menu items using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('menuitem')
            )
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] MenuItem.get_all: {str(e)}")
            return []

    @staticmethod
    def get_by_id(item_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'MENUITEM#{item_id}', f'MENUITEM#{item_id}')

    @staticmethod
    def get_by_category(category_id: str) -> List[Dict[str, Any]]:
        response = table.query(
            IndexName='GSI1',
            KeyConditionExpression=Key('GSI1PK').eq(f'CATEGORY#{category_id}')
        )
        items = response.get('Items', [])
        return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]

    @staticmethod
    def update(item_id: str, name: str = None, description: str = None, price_cents: int = None,
               available: bool = None, category_id: str = None, image_filename: str = None) -> None:
        update_expr = "SET "
        attr_values = {}
        attr_names = {}
        
        if name is not None:
            update_expr += "#name = :name, "
            attr_values[':name'] = name
            attr_names['#name'] = 'name'
        if description is not None:
            update_expr += "#desc = :desc, "
            attr_values[':desc'] = description
            attr_names['#desc'] = 'description'
        if price_cents is not None:
            update_expr += "price_cents = :price, "
            attr_values[':price'] = price_cents
        if available is not None:
            update_expr += "#avail = :avail, "
            attr_values[':avail'] = available
            attr_names['#avail'] = 'available'
        if category_id is not None:
            update_expr += "category_id = :cat_id, GSI1PK = :gsi1pk, "
            attr_values[':cat_id'] = category_id
            attr_values[':gsi1pk'] = f'CATEGORY#{category_id}'
        if image_filename is not None:
            update_expr += "image_filename = :img, "
            attr_values[':img'] = image_filename
        
        update_expr = update_expr.rstrip(', ')
        DynamoDBModel.update_item(
            f'MENUITEM#{item_id}', f'MENUITEM#{item_id}',
            update_expr, attr_values, attr_names if attr_names else None
        )

    @staticmethod
    def delete(item_id: str) -> None:
        DynamoDBModel.delete_item(f'MENUITEM#{item_id}', f'MENUITEM#{item_id}')

class Order:
    @staticmethod
    def create(customer_name: str, customer_email: str, customer_phone: str, total_cents: int) -> Dict[str, Any]:
        import uuid
        order_id = str(uuid.uuid4())
        item = {
            'PK': f'ORDER#{order_id}',
            'SK': f'ORDER#{order_id}',
            'entity_type': 'order',
            'id': order_id,
            'customer_name': customer_name,
            'customer_email': customer_email,
            'customer_phone': customer_phone,
            'total_cents': total_cents,
            'status': 'pending',
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all orders using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('order')
            )
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] Order.get_all: {str(e)}")
            return []

    @staticmethod
    def get_by_id(order_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'ORDER#{order_id}', f'ORDER#{order_id}')

    @staticmethod
    def update_status(order_id: str, status: str) -> None:
        DynamoDBModel.update_item(
            f'ORDER#{order_id}', f'ORDER#{order_id}',
            "SET #status = :status",
            {':status': status},
            {'#status': 'status'}
        )

class OrderItem:
    @staticmethod
    def create(order_id: str, menu_item_id: str, qty: int, unit_price_cents: int) -> Dict[str, Any]:
        import uuid
        item_id = str(uuid.uuid4())
        item = {
            'PK': f'ORDER#{order_id}',
            'SK': f'ORDERITEM#{item_id}',
            'entity_type': 'orderitem',
            'id': item_id,
            'order_id': order_id,
            'menu_item_id': menu_item_id,
            'qty': qty,
            'unit_price_cents': unit_price_cents,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_by_order(order_id: str) -> List[Dict[str, Any]]:
        return DynamoDBModel.query_by_prefix(f'ORDER#{order_id}', 'ORDERITEM#')

class Customer:
    @staticmethod
    def create(name: str, email: str, phone: str = None, newsletter: bool = False) -> Dict[str, Any]:
        import uuid
        customer_id = str(uuid.uuid4())
        item = {
            'PK': f'CUSTOMER#{customer_id}',
            'SK': f'CUSTOMER#{customer_id}',
            'GSI2PK': f'EMAIL#{email}',
            'GSI2SK': f'CUSTOMER#{customer_id}',
            'entity_type': 'customer',
            'id': customer_id,
            'name': name,
            'email': email,
            'phone': phone,
            'newsletter': newsletter,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        response = table.query(
            IndexName='GSI2',
            KeyConditionExpression=Key('GSI2PK').eq(f'EMAIL#{email}')
        )
        items = response.get('Items', [])
        if items:
            return DynamoDBModel._process_item_from_dynamodb(items[0])
        return None

    @staticmethod
    def get_by_id(customer_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'CUSTOMER#{customer_id}', f'CUSTOMER#{customer_id}')

class Reservation:
    @staticmethod
    def create(customer_id: str, time_slot: datetime, table_number: int, guests: int) -> Dict[str, Any]:
        import uuid
        reservation_id = str(uuid.uuid4())
        item = {
            'PK': f'RESERVATION#{reservation_id}',
            'SK': f'RESERVATION#{reservation_id}',
            'GSI3PK': f'TIMESLOT#{time_slot.strftime("%Y-%m-%dT%H:%M")}',
            'GSI3SK': f'RESERVATION#{reservation_id}',
            'entity_type': 'reservation',
            'id': reservation_id,
            'customer_id': customer_id,
            'time_slot': time_slot.isoformat(),
            'table_number': table_number,
            'guests': guests,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all reservations using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('reservation')
            )
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] Reservation.get_all: {str(e)}")
            return []

    @staticmethod
    def get_by_id(reservation_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'RESERVATION#{reservation_id}', f'RESERVATION#{reservation_id}')

    @staticmethod
    def get_by_timeslot(time_slot: datetime) -> List[Dict[str, Any]]:
        response = table.query(
            IndexName='GSI3',
            KeyConditionExpression=Key('GSI3PK').eq(f'TIMESLOT#{time_slot.strftime("%Y-%m-%dT%H:%M")}')
        )
        items = response.get('Items', [])
        return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]

    @staticmethod
    def delete(reservation_id: str) -> None:
        DynamoDBModel.delete_item(f'RESERVATION#{reservation_id}', f'RESERVATION#{reservation_id}')

class Promotion:
    @staticmethod
    def create(menu_item_id: str, percent: int, active: bool = True) -> Dict[str, Any]:
        import uuid
        promo_id = str(uuid.uuid4())
        item = {
            'PK': f'PROMOTION#{promo_id}',
            'SK': f'PROMOTION#{promo_id}',
            'GSI4PK': f'MENUITEM#{menu_item_id}',
            'GSI4SK': f'PROMOTION#{promo_id}',
            'entity_type': 'promotion',
            'id': promo_id,
            'menu_item_id': menu_item_id,
            'percent': percent,
            'active': active,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_active() -> List[Dict[str, Any]]:
        response = table.scan(
            FilterExpression=Attr('entity_type').eq('promotion') &
                           Attr('active').eq(True)
        )
        items = response.get('Items', [])
        return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all promotions using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('promotion')
            )
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] Promotion.get_all: {str(e)}")
            return []

    @staticmethod
    def get_by_id(promo_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'PROMOTION#{promo_id}', f'PROMOTION#{promo_id}')

    @staticmethod
    def get_by_menu_item(menu_item_id: str) -> Optional[Dict[str, Any]]:
        response = table.query(
            IndexName='GSI4',
            KeyConditionExpression=Key('GSI4PK').eq(f'MENUITEM#{menu_item_id}')
        )
        items = response.get('Items', [])
        if items:
            return DynamoDBModel._process_item_from_dynamodb(items[0])
        return None

    @staticmethod
    def update(promo_id: str, percent: int = None, active: bool = None) -> None:
        update_expr = "SET "
        attr_values = {}
        
        if percent is not None:
            update_expr += "percent = :percent, "
            attr_values[':percent'] = percent
        if active is not None:
            update_expr += "active = :active, "
            attr_values[':active'] = active
        
        update_expr = update_expr.rstrip(', ')
        DynamoDBModel.update_item(
            f'PROMOTION#{promo_id}', f'PROMOTION#{promo_id}',
            update_expr, attr_values
        )

    @staticmethod
    def delete(promo_id: str) -> None:
        DynamoDBModel.delete_item(f'PROMOTION#{promo_id}', f'PROMOTION#{promo_id}')

class Payment:
    @staticmethod
    def create(order_id: str, transaction_reference: str, payment_method: str, amount_cents: int) -> Dict[str, Any]:
        import uuid
        payment_id = str(uuid.uuid4())
        item = {
            'PK': f'PAYMENT#{payment_id}',
            'SK': f'PAYMENT#{payment_id}',
            'GSI5PK': f'ORDER#{order_id}',
            'GSI5SK': f'PAYMENT#{payment_id}',
            'entity_type': 'payment',
            'id': payment_id,
            'order_id': order_id,
            'transaction_reference': transaction_reference,
            'payment_method': payment_method,
            'amount_cents': amount_cents,
            'status': 'pending',
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all payments using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('payment')
            )
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] Payment.get_all: {str(e)}")
            return []

    @staticmethod
    def get_by_id(payment_id: str) -> Optional[Dict[str, Any]]:
        return DynamoDBModel.get_item(f'PAYMENT#{payment_id}', f'PAYMENT#{payment_id}')

    @staticmethod
    def get_by_order(order_id: str) -> List[Dict[str, Any]]:
        response = table.query(
            IndexName='GSI5',
            KeyConditionExpression=Key('GSI5PK').eq(f'ORDER#{order_id}')
        )
        items = response.get('Items', [])
        return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]

    @staticmethod
    def update_status(payment_id: str, status: str, processed_at: datetime = None) -> None:
        update_expr = "SET #status = :status"
        attr_values = {':status': status}
        attr_names = {'#status': 'status'}
        
        if processed_at:
            update_expr += ", processed_at = :processed_at"
            attr_values[':processed_at'] = processed_at
        
        DynamoDBModel.update_item(
            f'PAYMENT#{payment_id}', f'PAYMENT#{payment_id}',
            update_expr, attr_values, attr_names
        )

class Subscriber:
    @staticmethod
    def create(email: str) -> Dict[str, Any]:
        import uuid
        sub_id = str(uuid.uuid4())
        item = {
            'PK': f'SUBSCRIBER#{sub_id}',
            'SK': f'SUBSCRIBER#{sub_id}',
            'GSI6PK': f'EMAIL#{email}',
            'GSI6SK': f'SUBSCRIBER#{sub_id}',
            'entity_type': 'subscriber',
            'id': sub_id,
            'email': email,
            'created_at': datetime.utcnow()
        }
        DynamoDBModel.put_item(item)
        return item

    @staticmethod
    def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        response = table.query(
            IndexName='GSI6',
            KeyConditionExpression=Key('GSI6PK').eq(f'EMAIL#{email}')
        )
        items = response.get('Items', [])
        if items:
            return DynamoDBModel._process_item_from_dynamodb(items[0])
        return None

    @staticmethod
    def get_all() -> List[Dict[str, Any]]:
        """Get all subscribers using scan with entity_type filter."""
        try:
            response = table.scan(
                FilterExpression=Attr('entity_type').eq('subscriber')
            )
            items = response.get('Items', [])
            return [DynamoDBModel._process_item_from_dynamodb(item) for item in items]
        except Exception as e:
            print(f"[ERROR] Subscriber.get_all: {str(e)}")
            return []

# Utility functions
def upload_to_s3(file_content: bytes, filename: str, content_type: str = 'image/jpeg') -> str:
    """Upload file to S3 and return the URL."""
    key = f"images/{filename}"
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=file_content,
        ContentType=content_type
    )
    return f"https://{S3_BUCKET}.s3.amazonaws.com/{key}"

def get_s3_url(key: str) -> str:
    """Get S3 URL for a key."""
    return f"https://{S3_BUCKET}.s3.amazonaws.com/{key}"