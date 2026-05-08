import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatMWK } from '../utils/currency'
import { apiFetch } from '../utils/api'

const PAYMENT_METHODS = {
  bank_transfer: {
    name: 'National Bank Transfer',
    icon: '🏦',
    details: 'Account Number: 868655',
    code: '868655'
  },
  airtel_money: {
    name: 'Airtel Money',
    icon: '📱',
    details: 'Airtel Money Code: 54367',
    code: '54367'
  },
  mpamba: {
    name: 'M\'pamba',
    icon: '💳',
    details: 'M\'pamba Code: 2675211',
    code: '2675211'
  }
}

export default function Cart() {
  const navigate = useNavigate()
  const { items, clearCart, updateQuantity, removeFromCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('cart')
  const [orderId, setOrderId] = useState(null)
  const [totalCents, setTotalCents] = useState(0)
  const [customer, setCustomer] = useState({ customer_name: '', customer_email: '', customer_phone: '' })
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
  const [transactionRef, setTransactionRef] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [error, setError] = useState(null)

  const cartTotalCents = items.reduce((s, it) => s + (it.price_cents || 0) * (it.qty || 1), 0)
  const originalTotalCents = items.reduce((s, it) => {
    const orig = it.original_price_cents || it.price_cents || 0
    return s + orig * (it.qty || 1)
  }, 0)
  const savings = originalTotalCents - cartTotalCents

  async function handleCheckout(e) {
    e.preventDefault()
    setError(null)
    
    if (!customer.customer_name?.trim()) {
      setError('Please enter your name')
      return
    }
    if (!customer.customer_email?.trim()) {
      setError('Please enter your email address')
      return
    }
    if (!customer.customer_phone?.trim()) {
      setError('Please enter your phone number')
      return
    }
    if (items.length === 0) {
      setError('Add items to your cart before checkout')
      return
    }

    const payload = {
      items: items.map((it) => ({ menu_item_id: it.id, qty: it.qty, customizations: it.customizations })),
      customer_name: customer.customer_name,
      customer_email: customer.customer_email,
      customer_phone: customer.customer_phone,
    }
    
    setLoading(true)
    try {
      const res = await apiFetch('stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to create order. Please try again.')
        return
      }

      if (!data.orderId) {
        setError('Invalid response from server. Please try again.')
        return
      }

      setOrderId(data.orderId)
      setTotalCents(data.totalCents)
      setStep('payment')
      setSelectedPaymentMethod(null)
      setTransactionRef('')
    } catch (err) {
      console.error('Checkout error:', err)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!selectedPaymentMethod) {
      setError('Please select a payment method')
      return
    }

    if (!transactionRef.trim()) {
      setError('Please enter your transaction reference number')
      return
    }

    if (!orderId) {
      setError('Order not found. Please go back and try again.')
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch('payment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          payment_method: selectedPaymentMethod,
          transaction_reference: transactionRef.trim()
        })
      })
      
      let data
      try {
        data = await res.json()
      } catch (jsonErr) {
        const text = await res.text()
        console.error('Payment submit invalid JSON response:', text)
        throw new Error(text || 'Invalid server response')
      }
      
      // Payment successful if status is 200 OR data contains success/orderId/paymentId
      if (res.status === 200 || res.ok || data.success === true || data.orderId || data.paymentId) {
        // Clear cart and move to feedback page (do NOT clear cart twice)
        clearCart()
        setStep('feedback')
      } else {
        const serverError = data.error || data.message || `Payment submission failed (${res.status})`
        setError(serverError)
      }
    } catch (err) {
      console.error('Payment error:', err)
      setError(err.message || 'Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Success page with WhatsApp sharing option
  if (step === 'feedback') {
    const whatsappMessage = `Hello GOSH CAFE,\n\n✅ Payment Confirmation\n\nOrder #${orderId}\nTotal: ${formatMWK(totalCents)}\nPayment Method: ${selectedPaymentMethod === 'bank_transfer' ? 'Bank Transfer' : selectedPaymentMethod === 'airtel_money' ? 'Airtel Money' : 'M\'pamba'}\nTransaction Reference: ${transactionRef}\n\nCustomer: ${customer.customer_name}\nPhone: ${customer.customer_phone}\nEmail: ${customer.customer_email}\n\nFeedback: ${feedbackMessage || 'No feedback provided'}\n\nThank you for choosing GOSH CAFE!`
    const whatsappUrl = `https://wa.me/265995718815?text=${encodeURIComponent(whatsappMessage)}`

    return (
      <div className="cart-page">
        <div className="cart-main card-panel" style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h2>Payment Submitted Successfully!</h2>
          <p style={{ color: '#64748b', marginTop: '12px', marginBottom: '8px' }}>
            Your payment details have been recorded.
          </p>
          <p style={{ color: '#10b981', fontWeight: 700, marginBottom: '24px' }}>
            Order #{orderId} • {formatMWK(totalCents)}
          </p>
          
          <div style={{ textAlign: 'left', background: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
            <p style={{ fontWeight: 700, marginBottom: '8px' }}>📋 Payment Summary</p>
            <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Order ID:</strong> #{orderId}</p>
            <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Total:</strong> {formatMWK(totalCents)}</p>
            <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Payment Method:</strong> {selectedPaymentMethod === 'bank_transfer' ? '🏦 Bank Transfer' : selectedPaymentMethod === 'airtel_money' ? '📱 Airtel Money' : '💳 M\'pamba'}</p>
            <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Transaction Ref:</strong> {transactionRef}</p>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', textAlign: 'left', fontWeight: 700, marginBottom: '8px' }}>Share Feedback (Optional)</label>
            <textarea
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              placeholder="Tell us about your experience or add any additional notes..."
              style={{ width: '100%', padding: '12px', border: '1px solid #d4a373', borderRadius: '8px', minHeight: '100px', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <a 
              href={whatsappUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="btn btn-secondary" 
              style={{ padding: '12px 24px', textDecoration: 'none', display: 'inline-block', borderRadius: '8px', background: '#25D366', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              💬 Share Payment via WhatsApp
            </a>
            <button
              onClick={() => window.location.href = '/'}
              className="btn btn-primary"
              style={{ padding: '12px 24px', borderRadius: '8px', cursor: 'pointer' }}
            >
              🏠 Continue Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Payment method selection UI
  if (step === 'payment') {
    return (
      <div className="cart-page">
        <div className="cart-wrapper">
          <main className="cart-main card-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
<div className="cart-header">
  <h2 className="payment-title">
  Payment menthod used
  </h2>

  <div className="payment-amount-wrap">
    <p className="muted-small">
      Order #{orderId}
    </p>

    <div className="payment-arrow">↓</div>

    <div className="payment-amount">
      {formatMWK(totalCents)}
    </div>
  </div>
</div>

            <div className="payment-methods" style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
              {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
                <div
                  key={key}
                  onClick={() => setSelectedPaymentMethod(key)}
                  style={{
                    padding: '16px',
                    border: selectedPaymentMethod === key ? '2px solid #d4a373' : '2px solid #e5e7eb',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: selectedPaymentMethod === key ? 'rgba(212, 163, 115, 0.1)' : 'white',
                    transition: 'all 0.2s ease'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>{method.icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{method.name}</div>
                      <div style={{ fontSize: '0.9rem', color: '#64748b' }}>{method.details}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handlePaymentSubmit}>
              <div className="checkout-field">
                <label>Transaction Reference *</label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Enter your transaction/reference number"
                  style={{ padding: '10px 12px', border: '1px solid #d4a373', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                  required
                />
                <small style={{ color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Enter the transaction reference from your payment confirmation
                </small>
              </div>

              {error && (
                <div className="msg error" style={{ marginTop: '16px', padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px' }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    setStep('checkout')
                    setError(null)
                  }}
                  disabled={loading}
                  style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !selectedPaymentMethod}
                  style={{ flex: 1, borderRadius: '8px', cursor: 'pointer' }}
                >
                  {loading ? 'Submitting...' : 'Submit details'}
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    )
  }

  // Checkout form (collect customer details)
  if (step === 'checkout') {
    return (
      <div className="cart-page">
        <div className="cart-wrapper">
          <main className="cart-main card-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="cart-header">
              <h2>Order</h2>
              <p className="muted-small">Enter your details to continue</p>
            </div>

            <form onSubmit={handleCheckout}>
              <div className="checkout-field">
                <label>Full Name *</label>
                <input
                  value={customer.customer_name}
                  onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })}
                  placeholder="Full name"
                  style={{ padding: '10px 12px', border: '1px solid #d4a373', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div className="checkout-field">
                <label>Email *</label>
                <input
                  type="email"
                  value={customer.customer_email}
                  onChange={(e) => setCustomer({ ...customer, customer_email: e.target.value })}
                  placeholder="you@example.com"
                  style={{ padding: '10px 12px', border: '1px solid #d4a373', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div className="checkout-field">
                <label>Phone *</label>
                <input
                  type="tel"
                  value={customer.customer_phone}
                  onChange={(e) => setCustomer({ ...customer, customer_phone: e.target.value })}
                  placeholder="+265 99 123 4567"
                  style={{ padding: '10px 12px', border: '1px solid #d4a373', borderRadius: '8px', width: '100%', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ padding: '16px', background: 'rgba(212, 163, 115, 0.1)', borderRadius: '8px', marginTop: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Subtotal:</span>
                  <strong>{formatMWK(cartTotalCents)}</strong>
                </div>
                {savings > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#10b981' }}>
                    <span>Savings:</span>
                    <strong>{formatMWK(savings)}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 700, marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(212,163,115,0.2)' }}>
                  <span>Total:</span>
                  <span>{formatMWK(cartTotalCents)}</span>
                </div>
              </div>

              {error && (
                <div className="msg error" style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px' }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setStep('cart')}
                  disabled={loading}
                  style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || items.length === 0}
                  style={{ flex: 1, borderRadius: '8px', cursor: 'pointer' }}
                >
                  {loading ? 'Processing...' : 'Order Now'}
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    )
  }

  // Default cart view
  return (
    <div className="cart-page">
      <div className="cart-wrapper">
        <main className="cart-main card-panel">
          <div className="cart-header">
            <div>
              <h2>Shopping cart</h2>
              <p className="muted-small">{items.length === 0 ? 'Your cart is empty.' : `${items.length} item${items.length === 1 ? '' : 's'} in cart`}</p>
            </div>
            <button 
              type="button" 
              className="btn btn-danger btn-sm" 
              onClick={() => {
                if (!items.length) return
                if (window.confirm('Clear cart?')) clearCart()
              }}
              style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '8px 16px' }}
            >
              Clear cart
            </button>
          </div>

          {items.length === 0 ? (
            <div className="empty-cart-card">
              <p>No items yet. Browse the menu to add premium favorites.</p>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => navigate('/menu')}
                style={{ marginTop: '16px', borderRadius: '10px', cursor: 'pointer' }}
              >
                Back to menu
              </button>
            </div>
          ) : (
            <ul className="cart-list">
              {items.map((it, index) => {
                const hasDiscount = it.discount_percent && it.discount_percent > 0
                const originalPrice = it.original_price_cents ? formatMWK(it.original_price_cents) : null
                const customizations = it.customizations || {}
                return (
                  <li key={`${it.id}-${index}`} className="cart-item">
                    <div className="cart-item-details">
                      <div>
                        <h3>{it.name}</h3>
                        <div className="muted-small">{it.qty} × {formatMWK(it.price_cents)}</div>
                        {hasDiscount && originalPrice && (
                          <div className="cart-item-original">{originalPrice} each</div>
                        )}
                        {customizations.customIngredients && (
                          <div className="muted-small">Custom: {customizations.customIngredients}</div>
                        )}
                        {Object.keys(customizations.preferences || {}).filter(k => customizations.preferences[k]).length > 0 && (
                          <div className="muted-small">Prefs: {Object.keys(customizations.preferences).filter(k => customizations.preferences[k]).join(', ')}</div>
                        )}
                        {customizations.pickupTime && (
                          <div className="muted-small">Pickup: {new Date(customizations.pickupTime).toLocaleString()}</div>
                        )}
                      </div>
                      {hasDiscount && <span className="cart-badge">{it.discount_percent}% OFF</span>}
                    </div>

                    <div className="cart-item-actions">
                      <div className="quantity-control">
                        <button type="button" className="qty-btn" onClick={() => updateQuantity(it.id, it.qty - 1, customizations)}>-</button>
                        <span>{it.qty}</span>
                        <button type="button" className="qty-btn" onClick={() => updateQuantity(it.id, it.qty + 1, customizations)}>+</button>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-danger btn-sm" 
                        onClick={() => removeFromCart(it.id, customizations)}
                        style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '8px 16px' }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </main>

        <aside className="cart-summary card-panel">
          <div className="summary-header">
            <h3>Order summary</h3>
            <p className="muted-small">A polished checkout experience, ready for guests.</p>
          </div>
          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{formatMWK(cartTotalCents)}</strong>
          </div>
          {savings > 0 && (
            <div className="summary-row savings-row">
              <span>You save</span>
              <strong>{formatMWK(savings)}</strong>
            </div>
          )}
          <div className="summary-row total-row">
            <span>Total</span>
            <strong>{formatMWK(cartTotalCents)}</strong>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setStep('checkout') }} className="checkout-form">
            {items.length === 0 ? (
              <button type="button" className="btn btn-primary" disabled style={{ borderRadius: '8px' }}>
                Cart is empty
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px', cursor: 'pointer' }}>
                Order Now
              </button>
            )}
          </form>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => navigate('/menu')}
            style={{ marginTop: '16px', borderRadius: '8px', width: '100%', cursor: 'pointer' }}
          >
            Back to menu
          </button>
        </aside>
      </div>
    </div>
  )
}