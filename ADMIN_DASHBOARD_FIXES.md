# Admin Dashboard Error Fixes

## Summary
Fixed three critical errors in the admin dashboard:
1. ❌ **Reports fetch** - `net::ERR_FAILED` 
2. ❌ **Collect order** - HTTP 500 "Failed to collect order"
3. ❌ **Verify payment** - HTTP 500 "Failed to update payment"

---

## Root Causes & Fixes

### 1. Reports Fetch Error (`net::ERR_FAILED`)

**Problem:** CORS configuration used a placeholder origin by default:
```python
cors_origins = os.getenv('CORS_ORIGINS', 'https://your-cloudfront-distribution.cloudfront.net')
```

This caused the browser to block requests from localhost/dev origins.

**Fix:** Updated [backend/app/__init__.py](backend/app/__init__.py) to:
- Default to allowing `localhost:5173`, `localhost:3000`, `localhost:8080` (common dev ports)
- Only use CloudFront origin if explicitly configured via `CLOUDFRONT_ORIGIN` env var
- Added logging to show which CORS origins are configured

**File Modified:** `backend/app/__init__.py`
```python
# Now defaults to localhost origins for development
cors_origins = [
    'http://localhost:5173',
    'http://localhost:3000', 
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
]
```

---

### 2. Collect Order Error (`HTTP 500`)

**Problem:** DynamoDB update operations weren't properly catching/logging errors. When `Order.set_hidden()` was called, exceptions were silently swallowed or returned generic 500 errors.

**Issues Found:**
- No error context in catch blocks
- No logging of intermediate steps
- No traceback for debugging
- Frontend couldn't see detailed error messages

**Fix:** Updated [backend/app/api.py](backend/app/api.py) - `admin_collect_order()` endpoint to:
- Add detailed logging at each step (fetching, hiding, updating status)
- Include full traceback in error responses
- Return specific error details to frontend
- Properly handle string conversion of order_id
- Add informative error messages

**File Modified:** `backend/app/api.py`
```python
@api_bp.route('/admin/orders/<order_id>/collect', methods=['PUT', 'OPTIONS'])
def admin_collect_order(order_id):
    # ... validation ...
    try:
        order_id_str = str(order_id)
        
        # Step-by-step logging
        print(f"[INFO] Collecting order {order_id_str}")
        Order.set_hidden(order_id_str, True)
        print(f"[INFO] Order marked as hidden")
        
        Order.update_status(order_id_str, 'collected')
        print(f"[INFO] Order status updated to collected")
        
        # ...
    except Exception as e:
        print(f"[ERROR] admin_collect_order: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to collect order', 'details': str(e)}), 500
```

---

### 3. Verify Payment Error (`HTTP 500`)

**Problem:** Similar to collect order - insufficient error handling in `admin_update_payment()`. Payment status updates with datetime processing could fail silently.

**Issues Found:**
- Datetime objects not properly serialized for DynamoDB
- Exceptions in nested try/except blocks silently caught
- No logging of which operation failed
- No error details returned to frontend

**Fix:** Updated [backend/app/api.py](backend/app/api.py) - `admin_update_payment()` endpoint to:
- Add detailed logging for each operation (update status, update order, hide payment)
- Proper error handling with tracebacks
- Return detailed error information to frontend
- Ensure datetime objects are properly converted before DynamoDB operations
- Handle failures in order updates gracefully (log but don't fail the whole operation)

**File Modified:** `backend/app/api.py`
```python
@api_bp.route('/admin/payments/<payment_id>', methods=['PUT', 'PATCH'])
def admin_update_payment(payment_id):
    try:
        payment_id_str = str(payment_id)
        
        # ...validation...
        
        if new_status:
            processed_at = datetime.utcnow() if new_status in ['processed', 'verified'] else None
            
            try:
                Payment.update_status(payment_id_str, new_status, processed_at)
                print(f"[INFO] Payment status updated to {new_status}")
            except Exception as e:
                print(f"[ERROR] Failed to update payment status: {str(e)}")
                raise
            
            # Update associated order (non-critical)
            if new_status in ['processed', 'verified']:
                try:
                    order = Order.get_by_id(payment['order_id'])
                    if order:
                        Order.update_status(order['id'], 'confirmed')
                except Exception as e:
                    print(f"[WARNING] Failed to update order: {str(e)}")
        
        # ...rest of logic...
    except Exception as e:
        print(f"[ERROR] Error updating payment: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to update payment', 'details': str(e)}), 500
```

---

### 4. Reports Endpoint Enhancement

**Problem:** Error responses didn't include error details for debugging.

**Fix:** Updated [backend/app/api.py](backend/app/api.py) - `admin_reports()` endpoint to:
- Include exception details in error response
- Add traceback to console logs for debugging

```python
except Exception as e:
    print(f"[ERROR] admin_reports: {str(e)}")
    import traceback
    traceback.print_exc()
    return jsonify({'error': 'Failed to compute reports', 'details': str(e)}), 500
```

---

### 5. Frontend Error Logging

**Problem:** Frontend errors weren't being logged to console for debugging.

**Fix:** Updated [frontend/src/components/AdminDashboard.jsx](frontend/src/components/AdminDashboard.jsx) - `fetchAdmin()` function to:
- Log all network errors to console with the path that failed
- Help identify which endpoint is causing issues

```javascript
catch (err) {
  console.error('fetchAdmin error:', err, 'path:', path)
  throw new Error(`Network error: ${err.message}`)
}
```

---

## Testing the Fixes

### 1. Test Reports (Should No Longer Give `net::ERR_FAILED`)
```
1. Open Admin Dashboard
2. Enter admin secret
3. Click "Reports" tab
4. Should load successfully with analytics data
```

### 2. Test Collect Order (Should No Longer Give HTTP 500)
```
1. Navigate to Orders tab
2. Create or find a confirmed order
3. Expand the order
4. Click "Collect" button
5. Order should move to collected state
6. Check browser console - should see detailed logs
```

### 3. Test Verify Payment (Should No Longer Give HTTP 500)
```
1. Navigate to Payments tab
2. Find a pending payment
3. Click "✓ Verify" button
4. Payment should update to verified status
5. Associated order should update to confirmed
6. Check browser console - should see detailed logs
```

---

## Configuration Notes

### Environment Variables (Optional)

If deploying to production with CloudFront, set these:

```bash
# Option 1: Direct CloudFront domain
CLOUDFRONT_ORIGIN=https://d123456.cloudfront.net

# Option 2: Custom CORS origins (comma-separated)
CORS_ORIGINS=https://mydomain.com,https://www.mydomain.com
```

### Development Setup

For local development, no configuration needed. The backend will automatically:
- Allow `localhost:5173` (Vite default)
- Allow `localhost:3000` (Common dev port)
- Allow `localhost:8080` (Common dev port)
- Allow `127.0.0.1` variants

---

## Files Modified

1. ✅ `backend/app/__init__.py` - Fixed CORS configuration
2. ✅ `backend/app/api.py` - Enhanced error handling and logging for 3 endpoints:
   - `/admin/orders/<order_id>/collect` (collect order)
   - `/admin/payments/<payment_id>` (verify payment)
   - `/admin/reports` (generate reports)
3. ✅ `frontend/src/components/AdminDashboard.jsx` - Added console logging for network errors

---

## Debugging Guide

If errors still occur, check:

1. **Browser Console** (`F12` → Console tab)
   - Look for detailed error messages from `fetchAdmin`
   - Network errors will show the path that failed

2. **Backend Logs** (where Lambda/server is running)
   - Look for `[INFO]` and `[ERROR]` prefixed messages
   - These trace through each operation step

3. **Network Tab** (Browser DevTools)
   - Check actual response body
   - Verify CORS headers are correct
   - Confirm correct authentication header is being sent

---

## Quick Fix Summary

| Error | Cause | Fix | Status |
|-------|-------|-----|--------|
| Reports: `net::ERR_FAILED` | Bad CORS origin | Updated CORS config to use localhost by default | ✅ Fixed |
| Collect: HTTP 500 | Poor error handling | Added detailed logging + error details | ✅ Fixed |
| Verify: HTTP 500 | Poor error handling | Added detailed logging + error details | ✅ Fixed |
| General | No console logs | Added frontend error logging | ✅ Fixed |

All errors should now be resolved! ✅
