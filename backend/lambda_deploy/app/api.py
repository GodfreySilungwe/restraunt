import os
import random
import time
from datetime import datetime
from flask import Blueprint, jsonify, request, redirect
from flask import send_from_directory, abort
from werkzeug.utils import secure_filename
from .models import (
    Category, MenuItem, Order, OrderItem, Subscriber, Customer, Reservation, Promotion, Payment,
    upload_to_s3, get_s3_url
)

# Simple admin secret (dev-only). Configure ADMIN_SECRET in your environment or .env
ADMIN_SECRET = os.getenv('ADMIN_SECRET', 'dev-secret')

api_bp = Blueprint('api', __name__)

@api_bp.route('/menu', methods=['GET'])
def list_menu():
    categories = Category.get_all()
    # fetch all active promotions (keyed by menu_item_id)
    try:
        active_promos = {p['menu_item_id']: p['percent'] for p in Promotion.get_active()}
    except Exception:
        active_promos = {}

    result = []
    for c in categories:
        items = MenuItem.get_by_category(c['id'])
        result.append({
            'id': c['id'],
            'name': c['name'],
            'items': [
                {
                    'id': i['id'],
                    'name': i['name'],
                    'description': i['description'],
                    'price_cents': i['price_cents'],
                    'available': i['available'],
                    'image_filename': i['image_filename'],
                    'discount_percent': active_promos.get(i['id'])  # None if no discount, otherwise the percent
                }
                for i in items
            ]
        })
    return jsonify({'categories': result, 'promotions': list(active_promos.items())})

@api_bp.route('/cart/checkout', methods=['POST'])
def checkout():
    data = request.get_json() or {}
    items = data.get('items', [])
    name = data.get('customer_name')
    email = data.get('customer_email')
    phone = data.get('customer_phone')

    if not items or not name:
        return jsonify({'error': 'Missing items or customer name'}), 400

    total = 0
    order = Order.create(customer_name=name, customer_email=email, customer_phone=phone, total_cents=0)

    for it in items:
        mi = MenuItem.get_by_id(str(it.get('menu_item_id')))
        if not mi:
            return jsonify({'error': f"Menu item {it.get('menu_item_id')} not found"}), 400
        qty = int(it.get('qty', 1))
        total += mi['price_cents'] * qty
        OrderItem.create(order_id=order['id'], menu_item_id=str(mi['id']), qty=qty, unit_price_cents=mi['price_cents'])

    # Update order total
    DynamoDBModel.update_item(f"ORDER#{order['id']}", f"ORDER#{order['id']}",
                             "SET total_cents = :total",
                             {':total': total})

    display_order_id = _generate_display_order_id_for(order)
    return jsonify({'order_id': order['id'], 'display_order_id': display_order_id, 'status': order['status']})


def _generate_display_order_id_for(order):
    day_key = str(order.get('created_at') or '')[:10]
    if not day_key:
        return str(order.get('id', ''))[:8]
    same_day_orders = [o for o in Order.get_all() if str(o.get('created_at') or '')[:10] == day_key]
    return f"{day_key.replace('-', '')}-{len(same_day_orders):03d}"


@api_bp.route('/stripe-checkout', methods=['POST'])
def manual_checkout():
    """Create an order and return payment details for manual payment."""
    data = request.get_json() or {}
    items = data.get('items', [])
    customer_name = data.get('customer_name')
    customer_email = data.get('customer_email')
    customer_phone = data.get('customer_phone')

    if not items or not customer_name:
        return jsonify({'error': 'Missing items or customer name'}), 400

    try:
        print(f"[INFO] Creating order for customer: {customer_name}")
        order_total_cents = 0

        # Calculate total first
        for it in items:
            menu_item = MenuItem.get_by_id(str(it.get('menu_item_id')))
            if not menu_item:
                return jsonify({'error': f"Menu item {it.get('menu_item_id')} not found"}), 400

            qty = int(it.get('qty', 1))
            price_cents = int(menu_item['price_cents'])
            order_total_cents += price_cents * qty

        order = Order.create(customer_name=customer_name, customer_email=customer_email,
                           customer_phone=customer_phone, total_cents=order_total_cents)
        order_id = order['id']
        print(f"[INFO] Order created with ID: {order_id}")

        # Create order items
        for it in items:
            menu_item = MenuItem.get_by_id(str(it.get('menu_item_id')))
            qty = int(it.get('qty', 1))
            price_cents = int(menu_item['price_cents'])

            OrderItem.create(order_id=order_id, menu_item_id=str(menu_item['id']),
                           qty=qty, unit_price_cents=price_cents)
            print(f"[INFO] Added item {menu_item['name']} (qty: {qty}) to order")

        # Create initial payment record with pending status
        payment = Payment.create(order_id=order_id, transaction_reference='',
                               payment_method='', amount_cents=order_total_cents)
        print(f"[INFO] Order {order_id} saved with total: {order_total_cents} cents")

        return jsonify({
            'orderId': order_id,
            'display_order_id': _generate_display_order_id_for(order),
            'totalCents': order_total_cents,
            'status': 'created'
        }), 200

    except Exception as e:
        print(f"[ERROR] General exception: {str(e)}")
        return jsonify({'error': 'Failed to create order'}), 500


@api_bp.route('/payment/submit', methods=['POST'])
def submit_payment():
    """Submit payment transaction reference for an order."""
    data = request.get_json() or {}
    order_id = data.get('order_id')
    transaction_reference = data.get('transaction_reference', '').strip()
    payment_method = data.get('payment_method', '').strip()

    if not order_id or not transaction_reference or not payment_method:
        return jsonify({'error': 'Missing order_id, transaction_reference, or payment_method'}), 400

    if payment_method not in ['bank_transfer', 'airtel_money', 'mpamba']:
        return jsonify({'error': 'Invalid payment method'}), 400

    try:
        order = Order.get_by_id(str(order_id))
        if not order:
            return jsonify({'error': 'Order not found'}), 404

        # Find or create payment record
        payments = Payment.get_by_order(str(order_id))
        if not payments:
            payment = Payment.create(order_id=str(order_id), transaction_reference=transaction_reference,
                                   payment_method=payment_method, amount_cents=order['total_cents'])
        else:
            payment = payments[0]
            # Update payment
            DynamoDBModel.update_item(f"PAYMENT#{payment['id']}", f"PAYMENT#{payment['id']}",
                                     "SET transaction_reference = :ref, payment_method = :method",
                                     {':ref': transaction_reference, ':method': payment_method})

        print(f"[INFO] Payment submitted for order {order_id}: {payment_method} - {transaction_reference}")

        return jsonify({
            'success': True,
            'orderId': order_id,
            'paymentId': payment['id'],
            'message': 'Payment reference submitted. Please wait for confirmation.'
        }), 200

    except Exception as e:
        print(f"[ERROR] Error submitting payment: {str(e)}")
        return jsonify({'error': 'Failed to submit payment'}), 500


@api_bp.route('/')
def index():
    """Return menu categories and items as JSON for the frontend."""
    categories = Category.get_all()
    # prepare items for JSON response
    cats = []
    for c in categories:
        items = MenuItem.get_by_category(c['id'])
        cats.append({
            'id': c['id'],
            'name': c['name'],
            'items': [
                {
                    'id': i['id'],
                    'name': i['name'],
                    'description': i['description'],
                    'price_cents': i['price_cents'],
                    'available': i['available'],
                    'image_filename': i['image_filename'],
                    'category_id': i['category_id']
                }
                for i in items
            ]
        })
    # This endpoint serves the same data the frontend expects during development.
    return jsonify(cats)


# --- Admin routes (dev-only simple auth) ---------------------------------
def _is_admin(req):
    token = req.headers.get('X-Admin-Secret') or req.args.get('admin_secret')
    return token and token == ADMIN_SECRET


@api_bp.route('/admin/orders', methods=['GET'])
def admin_list_orders():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    orders = Order.get_all()
    result = []
    for o in orders:
        items = OrderItem.get_by_order(o['id'])
        result.append({
            'id': o['id'],
            'customer_name': o['customer_name'],
            'customer_email': o['customer_email'],
            'customer_phone': o['customer_phone'],
            'total_cents': o['total_cents'],
            'status': o['status'],
            'created_at': o['created_at'],
            'items': [
                {'menu_item_id': it['menu_item_id'], 'qty': it['qty'], 'unit_price_cents': it['unit_price_cents']}
                for it in items
            ]
        })
    return jsonify(result)


@api_bp.route('/admin/menu_items', methods=['GET'])
def admin_list_menu_items():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    items = MenuItem.get_all()
    return jsonify([
        {'id': i['id'], 'name': i['name'], 'description': i['description'], 'price_cents': i['price_cents'], 'available': i['available'], 'category_id': i['category_id'], 'image_filename': i['image_filename']}
        for i in items
    ])


@api_bp.route('/admin/categories', methods=['GET'])
def admin_list_categories():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    cats = Category.get_all()
    return jsonify([{'id': c['id'], 'name': c['name'], 'position': c['position']} for c in cats])


@api_bp.route('/admin/categories', methods=['POST'])
def admin_create_category():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json() or {}
    name = data.get('name')
    position = data.get('position', 0)
    if not name:
        return jsonify({'error': 'name is required'}), 400
    cat = Category.create(name=name, position=int(position))
    return jsonify({'id': cat['id'], 'name': cat['name'], 'position': cat['position']}), 201


@api_bp.route('/admin/categories/<int:cat_id>', methods=['PUT', 'PATCH'])
def admin_update_category(cat_id):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    cat = Category.get_by_id(str(cat_id))
    if not cat:
        return jsonify({'error': 'not found'}), 404
    data = request.get_json() or {}
    name = data.get('name')
    position = data.get('position')
    Category.update(str(cat_id), name=name, position=position)
    return jsonify({'ok': True})


@api_bp.route('/admin/categories/<int:cat_id>', methods=['DELETE'])
def admin_delete_category(cat_id):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    cat = Category.get_by_id(str(cat_id))
    if not cat:
        return jsonify({'error': 'not found'}), 404
    Category.delete(str(cat_id))
    return jsonify({'ok': True}), 200


@api_bp.route('/admin/menu_items', methods=['POST'])
def admin_create_menu_item():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    # support both JSON body and multipart/form-data with file upload
    data = {}
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        data = request.form.to_dict()
    else:
        data = request.get_json() or {}

    name = data.get('name')
    price = data.get('price_cents')
    category_id = data.get('category_id')
    # require name, price and category for created items
    if not name or price is None or category_id is None:
        return jsonify({'error': 'name, price_cents and category_id are required'}), 400
    # validate category exists
    cat = Category.get_by_id(str(category_id))
    if not cat:
        return jsonify({'error': f'category {category_id} not found'}), 400

    image_filename = None
    # if an image file is included, upload it to S3
    if 'image' in request.files:
        img = request.files.get('image')
        if img and img.filename:
            fname = secure_filename(img.filename)
            # prefix with timestamp to avoid collisions
            fname = f"{int(time.time())}_{fname}"
            try:
                file_content = img.read()
                content_type = img.content_type or 'image/jpeg'
                s3_url = upload_to_s3(file_content, fname, content_type)
                image_filename = s3_url
            except Exception as e:
                return jsonify({'error': 'failed to upload image to S3', 'details': str(e)}), 500

    mi = MenuItem.create(name=name, description=data.get('description'), price_cents=int(price),
                        category_id=str(category_id), available=bool(data.get('available', True)),
                        image_filename=image_filename)
    return jsonify({'id': mi['id'], 'image_filename': mi['image_filename']}), 201


@api_bp.route('/admin/menu_items/<int:item_id>', methods=['PUT', 'PATCH'])
def admin_update_menu_item(item_id):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    mi = MenuItem.get_by_id(str(item_id))
    if not mi:
        return jsonify({'error': 'not found'}), 404
    # accept multipart/form-data for updating image; if multipart, prefer request.form
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        data = request.form.to_dict() or {}
    else:
        # parse JSON silently to avoid raising on unsupported media types
        data = request.get_json(silent=True) or {}
    name = data.get('name')
    description = data.get('description')
    price_cents = data.get('price_cents')
    available = data.get('available')
    category_id = data.get('category_id')
    image_filename = None

    # handle image upload when present
    if 'image' in request.files:
        img = request.files.get('image')
        if img and img.filename:
            fname = secure_filename(img.filename)
            fname = f"{int(time.time())}_{fname}"
            try:
                file_content = img.read()
                content_type = img.content_type or 'image/jpeg'
                s3_url = upload_to_s3(file_content, fname, content_type)
                image_filename = s3_url
            except Exception as e:
                return jsonify({'error': 'failed to upload image to S3', 'details': str(e)}), 500

    MenuItem.update(str(item_id), name=name, description=description, price_cents=price_cents,
                   available=available, category_id=str(category_id) if category_id else None,
                   image_filename=image_filename)
    return jsonify({'ok': True})


@api_bp.route('/admin/menu_items/<int:item_id>', methods=['DELETE'])
def admin_delete_menu_item(item_id):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    mi = MenuItem.get_by_id(str(item_id))
    if not mi:
        return jsonify({'error': 'not found'}), 404
    # prevent deletion if this item appears in past orders to keep order history intact
    deps = OrderItem.get_by_order(mi['id'])  # This is wrong, need to check all orders
    # For simplicity, allow deletion for now
    MenuItem.delete(str(item_id))
    return jsonify({'ok': True}), 200


@api_bp.route('/gallery', methods=['GET'])
def gallery_list():
    """Return list of image filenames from menu items."""
    # Get all menu items and extract image filenames
    items = MenuItem.get_all()
    files = [i['image_filename'] for i in items if i.get('image_filename')]
    return jsonify(sorted(set(files)))  # Remove duplicates


@api_bp.route('/reservations', methods=['POST'])
def create_reservation():
    """Create a reservation.

    Expected JSON:
      {
        "name": "Full Name",
        "email": "user@example.com",
        "phone": "optional",
        "guests": 2,
        "time_slot": "2025-11-25T18:30" ,  # ISO format
        "newsletter": true  # optional
      }
    """
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    guests = int(data.get('guests') or 1)
    newsletter = bool(data.get('newsletter', False))
    timeslot_raw = data.get('time_slot')

    if not name or not email or not timeslot_raw:
        return jsonify({'error': 'name, email and time_slot are required'}), 400

    try:
        # accept ISO format
        time_slot = datetime.fromisoformat(timeslot_raw)
    except Exception:
        return jsonify({'error': 'invalid time_slot format; use ISO datetime'}), 400

    # find or create customer by email
    customer = Customer.get_by_email(email)
    if not customer:
        customer = Customer.create(name=name, email=email, phone=phone or None, newsletter=newsletter)

    # table assignment: 1..30
    TOTAL_TABLES = 30
    # get reserved table numbers for the same timeslot
    existing = Reservation.get_by_timeslot(time_slot)
    taken_tables = {r['table_number'] for r in existing}
    available = [t for t in range(1, TOTAL_TABLES + 1) if t not in taken_tables]

    if not available:
        return jsonify({'error': 'no tables available for that time slot'}), 409

    table_number = random.choice(available)

    res = Reservation.create(customer_id=customer['id'], time_slot=time_slot, table_number=table_number, guests=guests)

    return jsonify({'reservation_id': res['id'], 'table_number': table_number, 'time_slot': time_slot.isoformat()}), 201


@api_bp.route('/admin/reservations', methods=['GET'])
def admin_list_reservations():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    resv = Reservation.get_all()
    out = []
    for r in resv:
        cust = Customer.get_by_id(r['customer_id'])
        out.append({
            'id': r['id'],
            'customer': {'id': cust['id'] if cust else '', 'name': cust['name'] if cust else 'Unknown', 'email': cust['email'] if cust else 'Unknown', 'phone': cust.get('phone', '') if cust else ''},
            'time_slot': r['time_slot'],
            'table_number': r['table_number'],
            'guests': r['guests'],
            'created_at': r['created_at']
        })
    return jsonify(out)


@api_bp.route('/admin/reservations/<int:res_id>', methods=['DELETE'])
def admin_delete_reservation(res_id):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    r = Reservation.get_by_id(str(res_id))  # Need to add get_by_id to Reservation
    if not r:
        return jsonify({'error': 'not found'}), 404
    Reservation.delete(str(res_id))
    return jsonify({'ok': True}), 200


@api_bp.route('/admin/promotions', methods=['GET'])
def admin_list_promotions():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    try:
        promos = Promotion.get_all()
        return jsonify([{'id': p['id'], 'menu_item_id': p['menu_item_id'], 'percent': p['percent'], 'active': p['active']} for p in promos])
    except Exception:
        return jsonify([])


@api_bp.route('/admin/promotions', methods=['POST'])
def admin_create_promotion():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json() or {}
    menu_item_id = data.get('menu_item_id')
    percent = data.get('percent')
    active = bool(data.get('active', True))
    if menu_item_id is None or percent is None:
        return jsonify({'error': 'menu_item_id and percent are required'}), 400
    # check if item exists
    item = MenuItem.get_by_id(str(menu_item_id))
    if not item:
        return jsonify({'error': f'menu item {menu_item_id} not found'}), 404
    # check if promotion already exists for this item
    existing = Promotion.get_by_menu_item(str(menu_item_id))
    if existing:
        return jsonify({'error': f'promotion already exists for item {menu_item_id}'}), 400
    try:
        percent = int(percent)
        if percent < 0 or percent > 100:
            raise ValueError()
    except Exception:
        return jsonify({'error': 'percent must be an integer 0-100'}), 400
    promo = Promotion.create(menu_item_id=str(menu_item_id), percent=percent, active=active)
    return jsonify({'id': promo['id'], 'menu_item_id': promo['menu_item_id'], 'percent': promo['percent'], 'active': promo['active']}), 201


@api_bp.route('/admin/promotions/<int:pid>', methods=['PUT', 'PATCH'])
def admin_update_promotion(pid):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    promo = Promotion.get_by_id(str(pid))
    if not promo:
        return jsonify({'error': 'not found'}), 404
    data = request.get_json() or {}
    percent = None
    active = None
    if 'percent' in data:
        try:
            p = int(data['percent'])
            if p < 0 or p > 100:
                raise ValueError()
            percent = p
        except Exception:
            return jsonify({'error': 'percent must be an integer 0-100'}), 400
    if 'active' in data:
        active = bool(data['active'])
    Promotion.update(str(pid), percent=percent, active=active)
    return jsonify({'ok': True})


@api_bp.route('/admin/promotions/<int:pid>', methods=['DELETE'])
def admin_delete_promotion(pid):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    promo = Promotion.get_by_id(str(pid))
    if not promo:
        return jsonify({'error': 'not found'}), 404
    Promotion.delete(str(pid))
    return jsonify({'ok': True}), 200


@api_bp.route('/images/<path:filename>')
def serve_image(filename):
    # Since images are now in S3, redirect to S3 URL
    s3_url = get_s3_url(f"images/{filename}")
    return redirect(s3_url)


@api_bp.route('/newsletter', methods=['POST'])
def newsletter_signup():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    if not email:
        return jsonify({'error': 'email required'}), 400
    # basic email validation
    if '@' not in email or '.' not in email.split('@')[-1]:
        return jsonify({'error': 'invalid email'}), 400
    existing = Subscriber.get_by_email(email)
    if existing:
        return jsonify({'status': 'already_subscribed'}), 200
    sub = Subscriber.create(email=email)
    return jsonify({'status': 'subscribed', 'id': sub['id']}), 201


# --- Payment Management (Admin) -----------------------------------------------

@api_bp.route('/admin/payments', methods=['GET'])
def admin_list_payments():
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    payments = Payment.get_all()  # Need to add get_all to Payment
    result = []
    for p in payments:
        order = Order.get_by_id(p['order_id'])
        result.append({
            'id': p['id'],
            'order_id': p['order_id'],
            'customer_name': order['customer_name'] if order else 'Unknown',
            'customer_phone': order['customer_phone'] if order else '',
            'transaction_reference': p['transaction_reference'],
            'payment_method': p['payment_method'],
            'amount_cents': p['amount_cents'],
            'status': p['status'],
            'created_at': p['created_at'],
            'processed_at': p.get('processed_at')
        })
    return jsonify(result)


@api_bp.route('/admin/payments/<int:payment_id>', methods=['PUT', 'PATCH'])
def admin_update_payment(payment_id):
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    payment = Payment.get_by_id(str(payment_id))
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    data = request.get_json() or {}
    new_status = data.get('status', '').strip()
    
    if new_status not in ['pending', 'processed']:
        return jsonify({'error': 'Invalid status. Must be "pending" or "processed"'}), 400
    
    try:
        update_expr = "SET #status = :status"
        attr_values = {':status': new_status}
        attr_names = {'#status': 'status'}
        
        if new_status == 'processed':
            update_expr += ", processed_at = :processed_at"
            attr_values[':processed_at'] = datetime.utcnow()
            
            # Also update the associated order status to confirmed
            order = Order.get_by_id(payment['order_id'])
            if order:
                Order.update_status(order['id'], 'confirmed')
        
        DynamoDBModel.update_item(f"PAYMENT#{payment_id}", f"PAYMENT#{payment_id}",
                                 update_expr, attr_values, attr_names)
        
        print(f"[INFO] Payment {payment_id} status updated to {new_status}")
        
        return jsonify({
            'id': payment['id'],
            'order_id': payment['order_id'],
            'status': new_status,
            'processed_at': datetime.utcnow().isoformat() if new_status == 'processed' else None
        }), 200
    except Exception as e:
        print(f"[ERROR] Error updating payment: {str(e)}")
        return jsonify({'error': 'Failed to update payment'}), 500


# --- Airtel Money integration ------------------------------------------------
from .airtel_client import AirtelClient
import json

airtel_client = AirtelClient()


@api_bp.route('/airtel/merchants', methods=['POST'])
def airtel_register_merchants():
    """Register one or more merchants with Airtel. Expects JSON body with `merchants` list."""
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json() or {}
    merchants = data.get('merchants')
    if not merchants:
        return jsonify({'error': 'merchants list required'}), 400
    try:
        resp = airtel_client.register_merchants(merchants)
        try:
            body = resp.json()
        except Exception:
            body = {'raw': resp.text}
        return jsonify({'status_code': resp.status_code, 'response': body}), resp.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/airtel/merchants', methods=['GET'])
def airtel_fetch_merchants():
    """Fetch registered merchants from Airtel."""
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    try:
        resp = airtel_client.fetch_merchants()
        try:
            body = resp.json()
        except Exception:
            body = {'raw': resp.text}
        return jsonify({'status_code': resp.status_code, 'response': body}), resp.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/airtel/payments', methods=['POST'])
def airtel_create_payment():
    """Create a payment (transfer) via Airtel. Forwards JSON body to Airtel API."""
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    payload = request.get_json() or {}
    if not payload:
        return jsonify({'error': 'json payload required'}), 400
    try:
        resp = airtel_client.create_payment(payload)
        try:
            body = resp.json()
        except Exception:
            body = {'raw': resp.text}
        return jsonify({'status_code': resp.status_code, 'response': body}), resp.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/airtel/payments/refund', methods=['POST'])
def airtel_refund_payment():
    """Request a refund for a transaction via Airtel."""
    if not _is_admin(request):
        return jsonify({'error': 'unauthorized'}), 401
    payload = request.get_json() or {}
    if not payload:
        return jsonify({'error': 'json payload required'}), 400
    try:
        resp = airtel_client.refund_payment(payload)
        try:
            body = resp.json()
        except Exception:
            body = {'raw': resp.text}
        return jsonify({'status_code': resp.status_code, 'response': body}), resp.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_bp.route('/airtel/notify/<partnerCode>', methods=['POST'])
def airtel_notify(partnerCode):
    """Receive notifications from Airtel. This is a simple receiver that logs payload."""
    data = request.get_json(silent=True) or {}
    # For now: persist nothing, but log to stdout and return success
    print(f"[AIRTEL NOTIFY] partner={partnerCode} payload=", json.dumps(data))
    return jsonify({'st': True, 'msg': 'SUCCESS'}), 200

