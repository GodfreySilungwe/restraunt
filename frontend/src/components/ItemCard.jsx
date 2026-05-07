import React, { useState } from 'react'
import { useCart } from '../context/CartContext'
import { formatMWK } from '../utils/currency'
import { getImageSources } from '../utils/api'


export default function ItemCard({ item }) {
  const { addToCart } = useCart()
  const [cartAnimation, setCartAnimation] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [customIngredients, setCustomIngredients] = useState('')
  const [preferences, setPreferences] = useState({
    spicy: false,
    noOnions: false,
    extraCheese: false,
    glutenFree: false
  })
  const [pickupTime, setPickupTime] = useState('')
  const img = item && item.image_filename ? item.image_filename : null
  const imageSources = img ? getImageSources(img) : { primary: null, fallback: null }
  const hasDiscount = item.discount_percent && item.discount_percent > 0
  const discountedPrice = hasDiscount ? ((item.price_cents * (100 - item.discount_percent)) / 10000).toFixed(2) : null

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
      image: img ? imageSources.primary : null
    }
    
    setCartAnimation(animationElement)
    
    // Remove animation after it completes
    setTimeout(() => {
      setCartAnimation(null)
    }, 800)

    // Close modal
    setIsModalOpen(false)
  }

  return (
    <div className="item-card" style={{ background: 'var(--surface)', boxShadow: '0 12px 32px rgba(0,0,0,0.1)', borderRadius: '16px', overflow: 'hidden', cursor: 'pointer', position: 'relative' }} onClick={() => setIsModalOpen(true)}>
      {img ? (
        <div
          className="thumb"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(107, 114, 128, 0.3) 0%, rgba(55, 65, 81, 0.3) 100%), url(${imageSources.primary}), url(${imageSources.fallback})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            height: '160px',
            position: 'relative'
          }}
          aria-hidden
        />
      ) : (
        <div style={{ height: '160px', background: 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)' }} />
      )}

      {hasDiscount && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)',
          color: 'white',
          padding: '6px 12px',
          borderRadius: '20px',
          fontWeight: 700,
          fontSize: '12px',
          boxShadow: '0 4px 12px rgba(255, 107, 107, 0.4)',
          zIndex: 10
        }}>
          🎉 {item.discount_percent}% OFF
        </div>
      )}

      <div className="card-content" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3 className="card-title" style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700 }}>
          {item.name}
        </h3>
        <p className="muted card-desc" style={{ margin: '0 0 12px 0', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.4, flex: 1 }}>{item.description}</p>

        <div className="item-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
          <div>
            {hasDiscount ? (
              <div>
                <div style={{ fontSize: '11px', color: '#999', textDecoration: 'line-through', marginBottom: 2 }}>{formatMWK(item.price_cents)}</div>
                <strong style={{ fontSize: '18px', color: '#ff6b6b' }}>MK{discountedPrice}</strong>
              </div>
            ) : (
              <strong style={{ fontSize: '16px' }}>{formatMWK(item.price_cents)}</strong>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setIsModalOpen(true) }}
            className="btn"
            style={{
              background: hasDiscount ? 'linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%)' : 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '13px',
              boxShadow: hasDiscount ? '0 4px 12px rgba(255, 107, 107, 0.3)' : 'none'
            }}
          >
            Preference
          </button>
        </div>
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setIsModalOpen(false)}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>{item.name}</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--accent-dark)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Close
              </button>
            </div>
            <p>{item.description}</p>
            <p><strong>Price: </strong>{hasDiscount ? formatMWK(Math.round((item.price_cents * (100 - item.discount_percent)) / 100)) : formatMWK(item.price_cents)}</p>

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
              <h3>Preferences</h3>
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
                style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '8px', fontSize: '14px', width: '100%' }}
              />
            </div>

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
              Order now
            </button>
          </div>
        </div>
      )}

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
