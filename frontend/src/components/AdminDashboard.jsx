import React, { useEffect, useState } from 'react'
import { formatMWK } from '../utils/currency'
import { apiFetch, getApiUrl } from '../utils/api'

function useAdminFetch(path, adminSecret) {
  return apiFetch(path, { headers: { 'X-Admin-Secret': adminSecret } }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.error || `HTTP ${r.status}`)
    }
    return r.json()
  })
}

export default function AdminDashboard() {
  const [adminSecret, setAdminSecret] = useState(localStorage.getItem('admin_secret') || '')
  const [tab, setTab] = useState('orders')
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [reservations, setReservations] = useState([])
  const [promotions, setPromotions] = useState([])
  const [payments, setPayments] = useState([])
  const [error, setError] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)

  // dedupe menu items for dropdowns
  const uniqueMenuItems = React.useMemo(() => {
    const map = new Map()
    for (const it of menuItems || []) map.set(it.id, it)
    return Array.from(map.values())
  }, [menuItems])

  useEffect(() => {
    if (!adminSecret) return
    setError(null)
    const fetchCats = adminSecret
      ? () => useAdminFetch('admin/categories', adminSecret)
      : () => apiFetch('menu').then((r) => r.json()).then((cats) => cats.map((c) => ({ id: c.id, name: c.name })))

    fetchCats()
      .then(setCategories)
      .catch((e) => setError(e.message))

    if (tab === 'orders') {
      useAdminFetch('admin/orders', adminSecret)
        .then(setOrders)
        .catch((e) => setError(e.message))
    } else if (tab === 'reservations') {
      useAdminFetch('admin/reservations', adminSecret)
        .then(setReservations)
        .catch((e) => setError(e.message))
    } else if (tab === 'menu') {
      useAdminFetch('admin/menu_items', adminSecret)
        .then(setMenuItems)
        .catch((e) => setError(e.message))
    } else if (tab === 'categories') {
      useAdminFetch('admin/categories', adminSecret)
        .then(setCategories)
        .catch((e) => setError(e.message))
    } else if (tab === 'promotions') {
      if (adminSecret) {
        useAdminFetch('admin/menu_items', adminSecret).then(setMenuItems).catch(() => {})
        useAdminFetch('admin/promotions', adminSecret).then(setPromotions).catch((e) => setError(e.message))
      } else {
        apiFetch('menu')
          .then((r) => r.json())
          .then((data) => {
            const cats = Array.isArray(data) ? data : (data.categories || [])
            const items = []
            for (const c of cats) {
              for (const it of (c.items || [])) {
                items.push({ id: it.id, name: it.name, price_cents: it.price_cents, category_id: c.id, description: it.description, available: it.available, image_filename: it.image_filename })
              }
            }
            setMenuItems(items)
          })
          .catch(() => {})
        setPromotions([])
      }
    } else if (tab === 'payments') {
      useAdminFetch('admin/payments', adminSecret)
        .then(setPayments)
        .catch((e) => setError(e.message))
    }
  }, [tab, adminSecret])

  function promptForSecret() {
    const s = window.prompt('Enter admin secret (dev)')
    if (s) {
      localStorage.setItem('admin_secret', s)
      setAdminSecret(s)
      setError(null)
    }
  }

  async function fetchAdmin(path, opts = {}) {
    if (!adminSecret) return promptForSecret()
    opts.headers = { ...(opts.headers || {}), 'X-Admin-Secret': adminSecret }
    try {
      const res = await apiFetch(path, opts)
      const contentType = res.headers.get('content-type') || ''
      if (res.ok) {
        if (contentType.includes('application/json')) return await res.json()
        return await res.text()
      }
      let body = ''
      try {
        body = contentType.includes('application/json') ? JSON.stringify(await res.json()) : await res.text()
      } catch (e) {
        body = res.statusText
      }
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body}`)
    } catch (err) {
      throw new Error(`Network error: ${err.message}`)
    }
  }

  function notifyPromotionsUpdated() {
    try {
      window.dispatchEvent(new CustomEvent('promotions-updated'))
      localStorage.setItem('promotions_updated_at', String(Date.now()))
    } catch (e) {}
  }

  async function toggleAvailable(item) {
    try {
      await fetchAdmin(`admin/menu_items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available: !item.available }) })
      setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, available: !m.available } : m)))
    } catch (e) {
      setError(String(e))
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    try {
      await fetchAdmin(`admin/menu_items/${item.id}`, { method: 'DELETE' })
      setMenuItems((prev) => prev.filter((m) => m.id !== item.id))
    } catch (e) {
      setError(String(e))
    }
  }

  async function updateItem(item, updates) {
    try {
      if (updates && updates.imageFile) {
        const formData = new FormData()
        if ('name' in updates) formData.append('name', updates.name)
        if ('price_cents' in updates) formData.append('price_cents', updates.price_cents)
        if ('available' in updates) formData.append('available', updates.available)
        formData.append('category_id', updates.category_id || item.category_id || '')
        formData.append('description', updates.description || item.description || '')
        formData.append('image', updates.imageFile)
        await fetchAdmin(`admin/menu_items/${item.id}`, { method: 'PUT', body: formData })
      } else {
        await fetchAdmin(`admin/menu_items/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      }
      const items = await useAdminFetch('admin/menu_items', adminSecret)
      setMenuItems(items)
      setEditingItem(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function createItem(e) {
    e.preventDefault()
    const form = e.target
    const name = form.name.value
    const price = Math.round(parseFloat(form.price.value) * 100)
    const description = form.description.value
    const category_id = form.category_id.value
    
    if (!name || isNaN(price)) {
      setError('Please enter a valid name and price')
      return
    }
    
    if (!category_id) {
      setError('Please select a category')
      return
    }

    try {
      const payload = {
        name: name,
        price_cents: price,
        description: description,
        category_id: category_id,
        available: true
      }
      
      const response = await fetch('https://8nhfw2nleg.execute-api.us-east-1.amazonaws.com/api/admin/menu_items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret
        },
        body: JSON.stringify(payload)
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        setError(data.error || `HTTP ${response.status}`)
        return
      }
      
      const items = await useAdminFetch('admin/menu_items', adminSecret)
      setMenuItems(items)
      setEditingItem(null)
      form.reset()
    } catch (e) {
      console.error('Create item error:', e)
      setError(String(e))
    }
  }

  async function createCategory(e) {
    e.preventDefault()
    const form = e.target
    const name = form.cat_name.value
    const position = form.cat_position ? parseInt(form.cat_position.value, 10) : 0
    if (!name) return setError('category name required')
    try {
      await fetchAdmin('admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, position }) })
      const cats = await useAdminFetch('admin/categories', adminSecret)
      setCategories(cats)
      setEditingCategory(null)
      form.reset()
    } catch (e) {
      setError(String(e))
    }
  }

  async function updateCategory(cat, updates) {
    try {
      await fetchAdmin(`admin/categories/${cat.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, ...updates } : c)))
      setEditingCategory(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function deleteCategory(cat) {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return
    try {
      await fetchAdmin(`admin/categories/${cat.id}`, { method: 'DELETE' })
      setCategories((prev) => prev.filter((c) => c.id !== cat.id))
    } catch (e) {
      setError(String(e))
    }
  }

  async function togglePromoActive(promo) {
    try {
      await fetchAdmin(`admin/promotions/${promo.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !promo.active }) })
      setPromotions((prev) => prev.map((p) => (p.id === promo.id ? { ...p, active: !p.active } : p)))
      notifyPromotionsUpdated()
    } catch (e) {
      setError(String(e))
    }
  }

  async function updatePromoPercent(promo) {
    const newPct = window.prompt('Discount percent (0-100)', String(promo.percent))
    if (newPct === null) return
    try {
      await fetchAdmin(`admin/promotions/${promo.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percent: parseInt(newPct, 10) }) })
      setPromotions((prev) => prev.map((p) => (p.id === promo.id ? { ...p, percent: parseInt(newPct, 10) } : p)))
      notifyPromotionsUpdated()
    } catch (e) {
      setError(String(e))
    }
  }

  async function deletePromo(promo) {
    const item = menuItems.find((m) => m.id === promo.menu_item_id)
    const itemName = item ? item.name : `item ${promo.menu_item_id}`
    if (!window.confirm(`Delete promotion for "${itemName}"?`)) return
    try {
      await fetchAdmin(`admin/promotions/${promo.id}`, { method: 'DELETE' })
      setPromotions((prev) => prev.filter((p) => p.id !== promo.id))
      notifyPromotionsUpdated()
    } catch (e) {
      setError(String(e))
    }
  }

  async function createPromo(e) {
    e.preventDefault()
    const form = e.target
    const menu_item_id = form.menu_item_id.value
    const percent = parseInt(form.percent.value, 10)
    const active = form.active.checked
    
    if (!menu_item_id || isNaN(percent)) {
      setError('Please select a menu item and enter a valid discount percentage')
      return
    }
    
    if (percent < 0 || percent > 100) {
      setError('Discount percentage must be between 0 and 100')
      return
    }
    
    try {
      await fetchAdmin('admin/promotions', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          menu_item_id: menu_item_id,
          percent: percent, 
          active: active 
        })
      })
      const promos = await useAdminFetch('admin/promotions', adminSecret)
      setPromotions(promos)
      form.reset()
      notifyPromotionsUpdated()
      setError(null)
    } catch (e) {
      setError(String(e))
    }
  }

  async function updatePaymentStatus(payment, newStatus) {
    try {
      await fetchAdmin(`admin/payments/${payment.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
      setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: newStatus, processed_at: newStatus === 'processed' ? new Date().toISOString() : null } : p)))
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #faf9f8 0%, #f5f1ed 100%)', minHeight: '100vh', paddingBottom: 60 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 28px' }}>
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ margin: 0, fontSize: '2.8rem', fontWeight: 900, color: '#0f172a' }}>Admin Dashboard</h1>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '1.05rem' }}>Manage orders, menu, promotions, and analytics</p>
        </div>

        {!adminSecret && (
          <div style={{
            background: 'white',
            padding: '3rem 2rem',
            borderRadius: '20px',
            boxShadow: '0 12px 40px rgba(15,23,42,0.06)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
            <p style={{ fontSize: '1.1rem', color: '#475569', marginBottom: '2rem' }}>This area is protected. Please enter the admin secret to continue.</p>
            <button onClick={promptForSecret} style={{
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #d4a373 0%, #c9934d 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '999px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 12px 30px rgba(212,163,115,0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 16px 40px rgba(212,163,115,0.4)'
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 12px 30px rgba(212,163,115,0.3)'
            }}>
              Enter Admin Secret
            </button>
          </div>
        )}

        {adminSecret && (
          <div>
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '32px',
              overflowX: 'auto',
              paddingBottom: '12px',
              borderBottom: '2px solid rgba(212,163,115,0.1)'
            }}>
              {['reports', 'orders', 'payments', 'categories', 'menu', 'promotions', 'reservations'].map((tabName) => (
                <button
                  key={tabName}
                  onClick={() => setTab(tabName)}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    background: tab === tabName ? 'linear-gradient(135deg, #d4a373 0%, #c9934d 100%)' : 'rgba(212,163,115,0.1)',
                    color: tab === tabName ? 'white' : '#2c1810',
                    borderRadius: '999px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    textTransform: 'capitalize',
                    fontSize: '0.95rem',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    if (tab !== tabName) {
                      e.target.style.background = 'rgba(212,163,115,0.2)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (tab !== tabName) {
                      e.target.style.background = 'rgba(212,163,115,0.1)'
                    }
                  }}>
                  {tabName === 'reports' && '📊'} {tabName === 'orders' && '📦'} {tabName === 'payments' && '💳'} {tabName === 'categories' && '📂'} {tabName === 'menu' && '🍽️'} {tabName === 'promotions' && '🎉'} {tabName === 'reservations' && '📅'} {tabName.charAt(0).toUpperCase() + tabName.slice(1)}
                </button>
              ))}
            </div>

            {error && (
              <div style={{
                background: '#fee2e2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '1rem',
                borderRadius: '12px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Orders Tab */}
            {tab === 'orders' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>📦 Recent Orders</h3>
                  {orders.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No orders yet</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid rgba(212,163,115,0.1)' }}>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Order ID</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Customer</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Phone</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Total</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => (
                            <tr key={o.id} style={{ borderBottom: '1px solid rgba(212,163,115,0.05)' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(212,163,115,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#d4a373' }}>#{o.id}</td>
                              <td style={{ padding: '12px', color: '#0f172a' }}>{o.customer_name}</td>
                              <td style={{ padding: '12px', color: '#64748b' }}>{o.customer_phone || '-'}</td>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#10b981' }}>{formatMWK(o.total_cents)}</td>
                              <td style={{ padding: '12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  background: o.status === 'pending' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                  color: o.status === 'pending' ? '#f59e0b' : '#10b981'
                                }}>
                                  {o.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Categories Tab */}
            {tab === 'categories' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)', marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>📂 Categories</h3>
                  {categories.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No categories found</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {categories.map((c) => (
                        <div key={c.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '16px',
                          background: 'linear-gradient(90deg, rgba(212,163,115,0.08) 0%, transparent 100%)',
                          borderRadius: '12px',
                          border: '1px solid rgba(212,163,115,0.1)'
                        }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.name}</div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>Position: {c.position}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setEditingCategory(c)} style={{
                              padding: '6px 12px',
                              background: 'rgba(59,130,246,0.1)',
                              color: '#3b82f6',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 600
                            }}>Edit</button>
                            <button onClick={() => deleteCategory(c)} style={{
                              padding: '6px 12px',
                              background: '#fee2e2',
                              color: '#991b1b',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              fontWeight: 600
                            }}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>➕ Create New Category</h4>
                  <form onSubmit={createCategory} style={{ display: 'grid', gap: '16px' }}>
                    <input name="cat_name" placeholder="Category name" required style={{
                      padding: '10px 12px',
                      border: '1px solid rgba(212,163,115,0.2)',
                      borderRadius: '8px',
                      fontSize: '0.95rem'
                    }} />
                    <input name="cat_position" type="number" placeholder="Position (default 0)" defaultValue={0} style={{
                      padding: '10px 12px',
                      border: '1px solid rgba(212,163,115,0.2)',
                      borderRadius: '8px',
                      fontSize: '0.95rem'
                    }} />
                    <button type="submit" style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #d4a373 0%, #c9934d 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}>
                      Create Category
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Menu Tab */}
            {tab === 'menu' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)', marginBottom: '24px', overflowX: 'auto' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>🍽️ Menu Items</h3>
                  {menuItems.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No menu items found. Create your first item below.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid rgba(212,163,115,0.1)' }}>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Name</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Price</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Available</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {menuItems.map((m) => (
                          <tr key={m.id} style={{ borderBottom: '1px solid rgba(212,163,115,0.05)' }}>
                            <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{m.name}</td>
                            <td style={{ padding: '12px', color: '#10b981', fontWeight: 700 }}>{formatMWK(m.price_cents)}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 12px',
                                borderRadius: '999px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                background: m.available ? 'rgba(16, 185, 129, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                                color: m.available ? '#10b981' : '#6b7280'
                              }}>
                                {m.available ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                              <button onClick={() => toggleAvailable(m)} style={{
                                padding: '4px 10px',
                                background: 'rgba(212,163,115,0.1)',
                                color: '#d4a373',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600
                              }}>{m.available ? 'Disable' : 'Enable'}</button>
                              <button onClick={() => setEditingItem(m)} style={{
                                padding: '4px 10px',
                                background: 'rgba(59,130,246,0.1)',
                                color: '#3b82f6',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600
                              }}>Edit</button>
                              <button onClick={() => deleteItem(m)} style={{
                                padding: '4px 10px',
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600
                              }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>➕ Create New Item</h4>
                  <form onSubmit={createItem} style={{ display: 'grid', gap: '16px' }}>
                    <input name="name" placeholder="Item name" style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px' }} />
                    <input name="price" placeholder="Price in MWK" style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px' }} />
                    <select name="category_id" style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px' }}>
                      <option value="">-- select category --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <input name="description" placeholder="Description" style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px' }} />
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#0f172a' }}>Image</label>
                      <input type="file" name="image" accept="image/*" style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px', width: '100%' }} />
                    </div>
                    <button type="submit" style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #d4a373 0%, #c9934d 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}>
                      Create Item
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Promotions Tab */}
            {tab === 'promotions' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)', marginBottom: '24px', overflowX: 'auto' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>🎉 Promotions</h3>
                  {promotions.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No promotions found</p>
                  ) : (
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
  <thead>
    <tr style={{ borderBottom: '2px solid rgba(212,163,115,0.1)' }}>
      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Item</th>
      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Discount</th>
      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Active</th>
      <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Actions</th>
    </tr>
  </thead>
  <tbody>
    {/* Your rows here */}

                        {promotions.map((p) => {
                          const item = menuItems.find((m) => m.id === p.menu_item_id)
                          const itemName = item ? item.name : `item ${p.menu_item_id}`
                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid rgba(212,163,115,0.05)' }}>
                              <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>{itemName}</td>
                              <td style={{ padding: '12px', color: '#ff6b6b', fontWeight: 700 }}>{p.percent}% OFF</td>
                              <td style={{ padding: '12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  background: p.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                                  color: p.active ? '#10b981' : '#6b7280'
                                }}>
                                  {p.active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                                <button onClick={() => togglePromoActive(p)} style={{
                                  padding: '4px 10px',
                                  background: 'rgba(212,163,115,0.1)',
                                  color: '#d4a373',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: 600
                                }}>{p.active ? 'Disable' : 'Enable'}</button>
                                <button onClick={() => updatePromoPercent(p)} style={{
                                  padding: '4px 10px',
                                  background: 'rgba(59,130,246,0.1)',
                                  color: '#3b82f6',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: 600
                                }}>Edit %</button>
                                <button onClick={() => deletePromo(p)} style={{
                                  padding: '4px 10px',
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: 600
                                }}>Delete</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>➕ Create New Promotion</h4>
                  <form onSubmit={createPromo} style={{ display: 'grid', gap: '16px' }}>
                    <select name="menu_item_id" required style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px' }}>
                      <option value="">-- select item --</option>
                      {menuItems.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} — {formatMWK(m.price_cents)}</option>
                      ))}
                    </select>
                    <input name="percent" type="number" min="0" max="100" placeholder="Discount %" required style={{ padding: '10px 12px', border: '1px solid rgba(212,163,115,0.2)', borderRadius: '8px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="checkbox" name="active" id="promo-active" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                      <label htmlFor="promo-active" style={{ cursor: 'pointer', fontWeight: 500, color: '#0f172a' }}>Active</label>
                    </div>
                    <button type="submit" style={{
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #d4a373 0%, #c9934d 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}>
                      Create Promotion
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Payments Tab - Simplified */}
            {tab === 'payments' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>💳 Payment Tracking</h3>
                  {payments.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No payments yet</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid rgba(212,163,115,0.1)' }}>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Order #</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Customer</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Method</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Transaction Ref</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Amount</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Status</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id}>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#d4a373' }}>#{p.order_id}</td>
                              <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 600 }}>{p.customer_name}</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{p.customer_phone}</div>
                              </td>
                              <td style={{ padding: '12px', fontWeight: 600 }}>
                                {p.payment_method === 'bank_transfer' && '🏦 Bank Transfer'}
                                {p.payment_method === 'airtel_money' && '📱 Airtel Money'}
                                {p.payment_method === 'mpamba' && '💳 M\'pamba'}
                              </td>
                              <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{p.transaction_reference || '-'}</td>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#10b981' }}>{formatMWK(p.amount_cents)}</td>
                              <td style={{ padding: '12px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 12px',
                                  borderRadius: '999px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  background: p.status === 'pending' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                  color: p.status === 'pending' ? '#f59e0b' : '#10b981'
                                }}>
                                  {p.status}
                                </span>
                              </td>
                              <td style={{ padding: '12px' }}>
                                {p.status === 'pending' ? (
                                  <button onClick={() => updatePaymentStatus(p, 'processed')} style={{
                                    padding: '6px 12px',
                                    background: 'rgba(16, 185, 129, 0.2)',
                                    color: '#10b981',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                  }}>
                                    ✓ Process
                                  </button>
                                ) : (
                                  <button onClick={() => updatePaymentStatus(p, 'pending')} style={{
                                    padding: '6px 12px',
                                    background: 'rgba(245, 158, 11, 0.2)',
                                    color: '#f59e0b',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                  }}>
                                    Revert
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reservations Tab */}
            {tab === 'reservations' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>📅 Reservations</h3>
                  {reservations.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No reservations found</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid rgba(212,163,115,0.1)' }}>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>ID</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Customer</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Time</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Guests</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Created</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservations.map((r) => (
                            <tr key={r.id}>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#d4a373' }}>#{r.id}</td>
                              <td style={{ padding: '12px' }}>
                                <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.customer?.name}</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{r.customer?.email}</div>
                              </td>
                              <td style={{ padding: '12px', color: '#0f172a' }}>{new Date(r.time_slot).toLocaleString()}</td>
                              <td style={{ padding: '12px', color: '#0f172a', fontWeight: 600 }}>{r.guests}</td>
                              <td style={{ padding: '12px', color: '#64748b', fontSize: '0.85rem' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                              <td style={{ padding: '12px' }}>
                                <button onClick={async () => {
                                  if (!window.confirm('Cancel this reservation?')) return
                                  try {
                                    await fetchAdmin(`admin/reservations/${r.id}`, { method: 'DELETE' })
                                    setReservations((prev) => prev.filter((x) => x.id !== r.id))
                                  } catch (e) { setError(String(e)) }
                                }} style={{
                                  padding: '6px 12px',
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer'
                                }}>
                                  Cancel
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}