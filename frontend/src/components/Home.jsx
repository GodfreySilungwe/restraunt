import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { formatMWK } from '../utils/currency'
import { apiFetch, getImageSources } from '../utils/api'

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&h=700&fit=crop',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&h=700&fit=crop',
  'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=900&h=700&fit=crop',
  'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=900&h=700&fit=crop',
  'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=900&h=700&fit=crop'
]

const ADVERTS = [
  {
    title: 'Surprise booking',
    subtitle: 'Tonight’s private table is reserved — details kept delightfully exclusive.',
    icon: '✨'
  },
  {
    title: 'Customer of the week',
    subtitle: 'Celebrating our most loyal guest with a premium dining experience.',
    icon: '🏆'
  },
  {
    title: 'Featured guests',
    subtitle: 'Seen at GOSH CAFE: familiar names and local tastemakers.',
    icon: '🌟'
  }
]

const EVENTS = [
  {
    id: 1,
    title: 'Live Jazz Evening',
    date: 'Friday • 7pm',
    description: 'Relax with smooth live jazz and signature plates.',
    image: 'https://images.unsplash.com/photo-1511952260911-0b87ad2b1f8c?w=900&h=600&fit=crop'
  },
  {
    id: 2,
    title: 'Weekend Brunch',
    date: 'Saturday & Sunday',
    description: 'Start the day with fresh pastries, coffee, and good company.',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&h=600&fit=crop'
  },
  {
    id: 3,
    title: 'Chef Tasting Menu',
    date: 'Monthly',
    description: 'A rotating selection of our finest seasonal specialties.',
    image: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=900&h=600&fit=crop'
  }
]

function Home() {
  const { addToCart } = useCart()
  const [menuItems, setMenuItems] = useState([])
  const [promotions, setPromotions] = useState([])
  const [highlights, setHighlights] = useState([])
  const [cartAnimation, setCartAnimation] = useState(null)
  const [selectedPromo, setSelectedPromo] = useState(null)
  const [selectedDish, setSelectedDish] = useState(null)
  const [customIngredients, setCustomIngredients] = useState('')
  const [preferences, setPreferences] = useState({
    spicy: false,
    noOnions: false,
    extraCheese: false,
    glutenFree: false
  })
  const [pickupTime, setPickupTime] = useState('')

  const handleCardClick = (item) => {
    if (item.discount_percent) {
      setSelectedPromo(item)
    } else {
      setSelectedDish(item)
    }
  }

  const selectedItem = selectedPromo || selectedDish

  const handleAddToCart = (item, quantity, event) => {
    const customizations = {
      customIngredients,
      preferences,
      pickupTime
    }
    addToCart(item, quantity, customizations)
    
    // Create animation element
    const rect = event.target.getBoundingClientRect()
    const animationElement = {
      id: Date.now(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      image: item.image || FALLBACK_IMAGES[0]
    }
    
    setCartAnimation(animationElement)
    
    // Reset form
    setCustomIngredients('')
    setPreferences({
      spicy: false,
      noOnions: false,
      extraCheese: false,
      glutenFree: false
    })
    setPickupTime('')
    
    // Close modal
    setSelectedPromo(null)
    setSelectedDish(null)
    
    // Remove animation after it completes
    setTimeout(() => {
      setCartAnimation(null)
    }, 800)
  }

  const handlePreferenceChange = (preference) => {
    setPreferences(prev => ({
      ...prev,
      [preference]: !prev[preference]
    }))
  }
  useEffect(() => {
    apiFetch('menu')
      .then((response) => response.json())
      .then((data) => {
        const categoryData = Array.isArray(data) ? data : data.categories || []
        const dishes = categoryData.flatMap((category) =>
          (category.items || []).map((item, index) => {
            const imageSources = item.image_filename ? getImageSources(item.image_filename) : { primary: null, fallback: null }
            const image = imageSources.primary || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]
            return {
              ...item,
              category: category.name,
              image
            }
          })
        )

        setMenuItems(dishes)
        setHighlights(dishes.slice(0, 4))

        const promoDishes = dishes.filter((dish) => dish.discount_percent > 0)
        if (promoDishes.length > 0) {
          setPromotions(promoDishes.slice(0, 3))
        } else {
          setPromotions(dishes.slice(0, 3))
        }
      })
      .catch(() => {
        setMenuItems([])
        setPromotions([])
        setHighlights([])
      })
  }, [])

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <span className="hero-eyebrow">MADE FOR MALAWI</span>
          <h1>GOSH CAFE</h1>
          <p>Experience premium coffee, crafted plates, and warm hospitality in the heart of Lilongwe.</p>
          <div className="hero-actions">
            <Link to="/menu" className="btn btn-primary">Order now</Link>
            <Link to="/reserve" className="btn btn-secondary">Reserve a table</Link>
          </div>
          <div className="hero-stat-grid">
            <div className="hero-stat">
              <strong>98%</strong>
              <span>Guest satisfaction</span>
            </div>
            <div className="hero-stat">
              <strong>45+</strong>
              <span>Signature dishes</span>
            </div>
            <div className="hero-stat">
              <strong>24/7</strong>
              <span>Booking support</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-adverts">
        {ADVERTS.map((advert) => (
          <article key={advert.title} className="advert-card">
            <div className="advert-icon">{advert.icon}</div>
            <h3>{advert.title}</h3>
            <p>{advert.subtitle}</p>
          </article>
        ))}
      </section>

      <section className="home-promotions">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Limited time offers</span>
            <h2>Today's Promotions</h2>
          </div>
          <p>Discover today's best value dishes and special combos, created to feel premium and advert-ready.</p>
        </div>
        <div className="promo-grid">
          {promotions.map((promo) => {
            const discount = promo.discount_percent ? `${promo.discount_percent}% OFF` : 'Featured'
            const price = formatMWK(promo.price_cents || Math.round((promo.price || 0) * 100))
            return (
              <article 
                key={promo.id} 
                className="promo-card promo-clickable"
                onClick={() => handleCardClick(promo)}
              >
                <div className="promo-image" style={{ backgroundImage: `url('${promo.image || FALLBACK_IMAGES[0]}')` }} />
                <div className="promo-copy">
                  <span className="promo-badge">{discount}</span>
                  <h3>{promo.name || promo.title}</h3>
                  <p>{promo.description || 'A premium selection from our menu, crafted to taste exceptional.'}</p>
                  <div className="promo-footer">
                    <span className="promo-price">{price}</span>
                    <div className="promo-actions">
                      <button type="button" className="promo-action" onClick={(e) => { e.stopPropagation(); handleCardClick(promo) }}>Order now</button>
                      <button type="button" className="btn btn-tertiary" onClick={(e) => { e.stopPropagation(); handleCardClick(promo) }}>Preference</button>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="home-menu-preview">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Curated menu</span>
            <h2>Featured dishes to explore</h2>
          </div>
          <p>Handpicked favorites from our menu. Add them to your cart with one click.</p>
        </div>
        <div className="menu-feature-grid">
          {highlights.map((dish) => {
            const hasDiscount = dish.discount_percent && dish.discount_percent > 0
            const discountedPrice = hasDiscount ? ((dish.price_cents * (100 - dish.discount_percent)) / 10000).toFixed(2) : null
            return (
              <article 
                key={dish.id} 
                className="menu-card"
                onClick={() => handleCardClick(dish)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
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
                    🎉 {dish.discount_percent}% OFF
                  </div>
                )}
                <div className="menu-image" style={{ backgroundImage: `url('${dish.image || FALLBACK_IMAGES[0]}')` }} />
                <div className="menu-copy">
                  <h3>{dish.name}</h3>
                  <p>{dish.description || 'A delightful choice from our kitchen.'}</p>
                  <div className="menu-meta">
                    <span>{dish.category}</span>
                    {hasDiscount ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ textDecoration: 'line-through', fontSize: '12px', color: '#999' }}>{formatMWK(dish.price_cents || Math.round((dish.price || 0) * 100))}</strong>
                        <strong style={{ color: '#ff6b6b', fontSize: '16px' }}>{formatMWK(Math.round((dish.price_cents * (100 - dish.discount_percent)) / 100))}</strong>
                      </div>
                    ) : (
                      <strong>{formatMWK(dish.price_cents || Math.round((dish.price || 0) * 100))}</strong>
                    )}
                  </div>
                  <div className="menu-actions">
                    <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); handleCardClick(dish) }}>Order now</button>
                    <button type="button" className="btn btn-tertiary" onClick={(e) => { e.stopPropagation(); handleCardClick(dish) }}>Preference</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="home-events">
        <div className="section-heading">
          <div>
            <span className="section-eyebrow">Events & news</span>
            <h2>Upcoming experiences</h2>
          </div>
          <p>Join us for live music, brunch gatherings, and chef tasting evenings.</p>
        </div>
        <div className="events-grid">
          {EVENTS.map((event) => (
            <article key={event.id} className="event-card">
              <div className="event-image" style={{ backgroundImage: `url(${event.image})` }} />
              <div className="event-copy">
                <span className="event-date">{event.date}</span>
                <h3>{event.title}</h3>
                <p>{event.description}</p>
                <button type="button" className="btn btn-secondary">Reserve a seat</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-cta">
        <div className="cta-panel">
          <div>
            <span>Ready to book?</span>
            <h2>Reserve your table and experience GOSH CAFE today.</h2>
          </div>
          <div className="cta-actions">
            <Link to="/reserve" className="btn btn-primary">Reserve now</Link>
            <Link to="/menu" className="btn btn-secondary">View the menu</Link>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="footer-grid">
          <div className="footer-contact">
            <h3>GOSH CAFE</h3>
            <p>Modern Malawian hospitality, elevated for every occasion.</p>
          </div>
          <div className="footer-contact">
            <h4>Contact</h4>
            <p>📍 Lilongwe, Malawi</p>
            <p>📞 +265 995 718 815</p>
            <p>✉️ hello@goshcafe.com</p>
          </div>
          <div className="footer-contact">
            <h4>Opening hours</h4>
            <p>Mon-Thu: 11am - 10pm</p>
            <p>Fri-Sat: 11am - 11pm</p>
            <p>Sun: 12pm - 9pm</p>
          </div>
          <div className="footer-contact">
            <h4>Follow us</h4>
            <div className="social-icons">
              <a href="#">Instagram</a>
              <a href="#">Facebook</a>
              <a href="#">Twitter</a>
            </div>
          </div>
        </div>
        <div className="footer-note">© 2026 GOSH CAFE. All rights reserved.</div>
      </footer>

      {selectedItem && (
        <div className="item-modal-backdrop" onClick={() => { setSelectedPromo(null); setSelectedDish(null) }}>
          <div className="item-modal" onClick={(e) => e.stopPropagation()}>
            <div className="item-modal-header">
              <button type="button" className="btn btn-tertiary" onClick={() => { setSelectedPromo(null); setSelectedDish(null) }}>← Back</button>
              <button type="button" className="btn btn-danger" onClick={() => { setSelectedPromo(null); setSelectedDish(null) }}>Close</button>
            </div>
            <div className="item-modal-body">
              <div className="item-modal-preview" style={{ backgroundImage: `url('${selectedItem.image || FALLBACK_IMAGES[0]}')` }} />
              <div className="item-modal-content">
                <h2>{selectedItem.name}</h2>
                <p>{selectedItem.description}</p>
                <div className="item-modal-meta">
                  {selectedItem.discount_percent ? (
                    <div>
                      <div style={{ color: '#999', textDecoration: 'line-through' }}>{formatMWK(selectedItem.price_cents)}</div>
                      <div style={{ fontSize: '1.55rem', color: '#ff6b6b', fontWeight: 700 }}>
                        {formatMWK(Math.round(selectedItem.price_cents * (100 - selectedItem.discount_percent) / 100))}
                      </div>
                      <div style={{ color: '#ff6b6b', fontWeight: 700 }}>{selectedItem.discount_percent}% off</div>
                    </div>
                  ) : (
                    <strong>{formatMWK(selectedItem.price_cents)}</strong>
                  )}
                  <div>{selectedItem.category || selectedItem.category}</div>
                </div>
                <div className="item-modal-form">
                  <label>Custom ingredients</label>
                  <textarea
                    value={customIngredients}
                    onChange={(e) => setCustomIngredients(e.target.value)}
                    placeholder="Add any custom ingredients or modifications..."
                  />
                  <div className="item-modal-preferences">
                    {['spicy', 'noOnions', 'extraCheese', 'glutenFree'].map((key) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={preferences[key]}
                          onChange={() => setPreferences((prev) => ({ ...prev, [key]: !prev[key] }))}
                        />
                        {key === 'spicy' ? 'Spicy' : key === 'noOnions' ? 'No Onions' : key === 'extraCheese' ? 'Extra Cheese' : 'Gluten Free'}
                      </label>
                    ))}
                  </div>
                  <label>Pickup time</label>
                  <input
                    type="datetime-local"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                  />
                  <div className="item-modal-actions">
                    <button type="button" className="btn btn-primary" onClick={(e) => handleAddToCart(selectedItem, 1, e)}>Add to cart</button>
                    <button type="button" className="btn btn-tertiary" onClick={() => { setSelectedPromo(null); setSelectedDish(null) }}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {cartAnimation && (
        <div
          className="cart-animation"
          style={{
            left: cartAnimation.x - 25,
            top: cartAnimation.y - 25,
            backgroundImage: `url(${cartAnimation.image})`,
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

export default Home
