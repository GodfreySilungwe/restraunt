import React, { useState } from 'react'
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
  const { items, clearCart, updateQuantity, removeFromCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('cart')
  const [orderId, setOrderId] = useState(null)
  const [totalCents, setTotalCents] = useState(0)
  const [customer, setCustomer] = useState({ customer_name: '', customer_email: '', customer_phone: '' })
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
  const [transactionRef, setTransactionRef] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
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
    
    // Validation
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
      
      // Check if payment was successful (status 200 or data contains success/orderId)
      if (res.ok && (data.success === true || data.orderId || data.paymentId)) {
        clearCart()
        setStep('feedback')
        setFeedbackMessage('')
        setFeedbackSent(false)
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

  // Payment method selection UI
  if (step === 'payment') {
    return (
      <div className="cart-page">
        <div className="cart-wrapper">
          <main className="cart-main card-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div className="cart-header">
              <h2>📱 Complete Payment</h2>
              <p className="muted-small">Order #{orderId} • {formatMWK(totalCents)}</p>
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
                  style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none' }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !selectedPaymentMethod}
                  style={{ flex: 1 }}
                >
                  {loading ? 'Submitting...' : 'Submit Details'}
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    )
  }

  // Feedback page after payment submission
  if (step === 'feedback') {
    const whatsappMessage = `Hello GOSH CAFE, my order #${orderId} payment confirmation is ready.\nOrder total: ${formatMWK(totalCents)}\nTransaction reference: ${transactionRef}\nFeedback: ${feedbackMessage}`
    const whatsappUrl = `https://wa.me/265995718815?text=${encodeURIComponent(whatsappMessage)}`

    if (feedbackSent) {
      return (
        <div className="cart-page">
          <div className="cart-main card-panel" style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2>Thank you for your feedback!</h2>
            <p style={{ color: '#64748b', marginTop: '12px', marginBottom: '24px' }}>
              We have received your feedback and the payment confirmation details. A member of our team will follow up with you shortly.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '12px 24px' }}>
                Send confirmation on WhatsApp
              </a>
              <button
                onClick={() => window.location.href = '/'}
                className="btn btn-primary"
                style={{ padding: '12px 24px' }}
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="cart-page">
        <div className="cart-main card-panel" style={{ maxWidth: '700px', margin: '40px auto' }}>
          <div className="cart-header">
            <h2>Share Feedback</h2>
            <p className="muted-small">Thank you for submitting payment. Please share your feedback below.</p>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault()
            if (!feedbackMessage.trim()) {
              setError('Please enter your feedback before continuing.')
              return
            }
            setError(null)
            setFeedbackSent(true)
          }}>
            <div className="checkout-field">
              <label>Feedback *</label>
              <textarea
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                placeholder="Tell us about your experience or additional confirmation details..."
                style={{ padding: '12px 14px', border: '1px solid #d4a373', borderRadius: '8px', width: '100%', boxSizing: 'border-box', minHeight: '140px' }}
              />
            </div>
            <div className="checkout-field" style={{ background: '#f8fafc', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Confirmation details</p>
              <p style={{ margin: '8px 0 0', color: '#475569' }}>
                Order #{orderId} • {formatMWK(totalCents)}
              </p>
              <p style={{ margin: '8px 0 0', color: '#475569' }}>
                Transaction ref: {transactionRef}
              </p>
              <p style={{ margin: '8px 0 0', color: '#475569' }}>
                WhatsApp will forward these details automatically.
              </p>
            </div>
            {error && (
              <div className="msg error" style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px' }}>
                ⚠️ {error}
              </div>
            )}
            <div style={{ display: 'grid', gap: '12px' }}>
              <button type="submit" className="btn btn-primary">Send Feedback</button>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                Open WhatsApp with confirmation
              </a>
              <button type="button" className="btn btn-tertiary" onClick={() => window.location.href = '/'}>
                Continue Shopping
              </button>
            </div>
          </form>
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
              <h2>Checkout</h2>
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
                  style={{ flex: 1, background: '#dc2626', color: 'white', border: 'none' }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || items.length === 0}
                  style={{ flex: 1 }}
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
              style={{ background: '#dc2626', color: 'white', border: 'none' }}
            >
              Clear cart
            </button>
          </div>

          {items.length === 0 ? (
            <div className="empty-cart-card">
              <p>No items yet. Browse the menu to add premium favorites.</p>
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
                        style={{ background: '#dc2626', color: 'white', border: 'none' }}
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
              <button type="button" className="btn btn-primary" disabled>
                Cart is empty
              </button>
            ) : (
              <button type="submit" className="btn btn-primary">
                Order Now
              </button>
            )}
          </form>
        </aside>
      </div>
    </div>
  )
}