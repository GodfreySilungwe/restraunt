import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatMWK } from '../utils/currency'
import { apiFetch, getImageSources } from '../utils/api'

export default function ItemDetail() {
  const { id } = useParams()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const { addToCart } = useCart()
  const [cartAnimation, setCartAnimation] = useState(null)
  const [customIngredients, setCustomIngredients] = useState('')
  const [preferences, setPreferences] = useState({
    spicy: false,
    noOnions: false,
    extraCheese: false,
    glutenFree: false
  })
  const [pickupTime, setPickupTime] = useState('')

  const handleAddToCart = (event) => {
    const customizations = {
      customIngredients,
      preferences,
      pickupTime
    }
    addToCart(item, 1, customizations)
    
    // Create animation element
    const rect = event.target.getBoundingClientRect()
    const animationElement = {
      id: Date.now(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      image: item.image_filename ? getImageSources(item.image_filename).primary : null
    }
    
    setCartAnimation(animationElement)
    
    // Remove animation after it completes
    setTimeout(() => {
      setCartAnimation(null)
    }, 800)
  }

  useEffect(() => {
    setLoading(true)
    apiFetch('menu')
      .then((r) => r.json())
      .then((data) => {
        // /api/menu may return an array or an object { categories: [...], promotions: [...] }
        const cats = Array.isArray(data) ? data : (data.categories || [])
        let found = null
        for (const c of cats) {
          const f = (c.items || []).find((it) => String(it.id) === String(id))
          if (f) {
            found = f
            break
          }
        }
        setItem(found)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div>Loading...</div>
  if (!item) return <div>Item not found</div>

  const hasDiscount = item.discount_percent && item.discount_percent > 0
  const discountedPriceCents = hasDiscount
    ? Math.round(item.price_cents * (100 - item.discount_percent) / 100)
    : item.price_cents
  const discountedPrice = (discountedPriceCents / 100).toFixed(2)

  const imageSources = item.image_filename ? getImageSources(item.image_filename) : { primary: null, fallback: null }

  return (
    <div className="item-detail" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      {item.image_filename && (
        <img
          src={imageSources.primary}
          alt={item.name}
          onError={(e) => {
            if (imageSources.fallback && e.currentTarget.src !== imageSources.fallback) {
              e.currentTarget.src = imageSources.fallback
            }
          }}
          style={{ width: '100%', height: '300px', objectFit: 'cover', borderRadius: '12px', marginBottom: '20px' }}
        />
      )}
      <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>{item.name}</h2>
      <p className="muted" style={{ fontSize: '16px', lineHeight: '1.5', marginBottom: '20px' }}>{item.description}</p>

      <div style={{ marginBottom: '20px' }}>
        <h3>Price</h3>
        {hasDiscount ? (
          <span>
            <span style={{ fontSize: 14, color: '#999', textDecoration: 'line-through', marginRight: 8 }}>{formatMWK(item.price_cents)}</span>
            <span style={{ fontSize: 20, color: '#ff6b6b', fontWeight: 700 }}>MK{discountedPrice}</span>
            <span style={{ marginLeft: 8, color: '#ff6b6b', fontSize: 13 }}>(-{item.discount_percent}%)</span>
          </span>
        ) : (
          <strong>{formatMWK(item.price_cents)}</strong>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Custom Ingredients</h3>
        <textarea
          value={customIngredients}
          onChange={(e) => setCustomIngredients(e.target.value)}
          placeholder="Add any custom ingredients or modifications..."
          style={{ width: '100%', height: '80px', padding: '10px', border: '1px solid #ccc', borderRadius: '8px', fontSize: '14px' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Order Now</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <label>
            <input type="checkbox" checked={preferences.spicy} onChange={(e) => setPreferences({ ...preferences, spicy: e.target.checked })} />
            Spicy
          </label>
          <label>
            <input type="checkbox" checked={preferences.noOnions} onChange={(e) => setPreferences({ ...preferences, noOnions: e.target.checked })} />
            No Onions
          </label>
          <label>
            <input type="checkbox" checked={preferences.extraCheese} onChange={(e) => setPreferences({ ...preferences, extraCheese: e.target.checked })} />
            Extra Cheese
          </label>
          <label>
            <input type="checkbox" checked={preferences.glutenFree} onChange={(e) => setPreferences({ ...preferences, glutenFree: e.target.checked })} />
            Gluten Free
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Pickup Time</h3>
        <input
          type="datetime-local"
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
          style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '8px', fontSize: '14px' }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={handleAddToCart}
          className="btn"
          style={{
            background: hasDiscount ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)' : 'var(--accent)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Confirm Order {hasDiscount ? `— ${formatMWK(Math.round((item.price_cents * (100 - item.discount_percent)) / 100))}` : ''}
        </button>
      </div>

      {cartAnimation && (
        <div
          className="cart-animation"
          style={{
            left: cartAnimation.x - 25,
            top: cartAnimation.y - 25,
            backgroundImage: cartAnimation.image ? `url(${cartAnimation.image})` : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            width: 50,
            height: 50,
            borderRadius: '50%',
            border: '2px solid var(--accent)'
          }}
        />
      )}
    </div>
  )
}
