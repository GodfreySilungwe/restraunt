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
  const [reports, setReports] = useState(null)
  const [orderSearch, setOrderSearch] = useState('')
  const [error, setError] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [expandedOrderId, setExpandedOrderId] = useState(null)

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
      // also fetch payments so we can know which orders are paid
      useAdminFetch('admin/payments', adminSecret)
        .then(setPayments)
        .catch(() => {})
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
      useAdminFetch('admin/orders', adminSecret)
        .then(setOrders)
        .catch(() => {})
    } else if (tab === 'reports') {
      useAdminFetch('admin/reports', adminSecret)
        .then(setReports)
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

  function toggleOrderExpanded(orderId) {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId))
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
  const imageFile = form.image?.files?.[0]
  
  if (!name || isNaN(price)) {
    setError('Please enter a valid name and price')
    return
  }
  
  if (!category_id) {
    setError('Please select a category')
    return
  }

  try {
    // Use FormData for file upload
    const formData = new FormData()
    formData.append('name', name)
    formData.append('price_cents', price.toString())
    formData.append('description', description || '')
    formData.append('category_id', category_id)
    formData.append('available', 'true')
    
    // Append image if selected
    if (imageFile) {
      formData.append('image', imageFile)
    }
    
    const response = await fetch('https://8nhfw2nleg.execute-api.us-east-1.amazonaws.com/api/admin/menu_items', {
      method: 'POST',
      headers: {
        'X-Admin-Secret': adminSecret
        // Don't set Content-Type header - browser will set it with boundary for FormData
      },
      body: formData
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      setError(data.error || `HTTP ${response.status}`)
      return
    }
    
    // Refresh the menu items list
    const items = await useAdminFetch('admin/menu_items', adminSecret)
    setMenuItems(items)
    setEditingItem(null)
    form.reset()
    // Clear the file input
    if (form.image) form.image.value = ''
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
      const updated = await fetchAdmin(`admin/payments/${payment.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
      setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, status: updated.status, processed_at: updated.processed_at, hidden: !!updated.hidden } : p)))
    } catch (e) {
      setError(String(e))
    }
  }

  const filteredOrders = orders.filter((order) => {
    const term = orderSearch.trim().toLowerCase()
    if (!term) return true
    return [order.display_order_id, order.id, order.customer_name, order.customer_email, order.customer_phone]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term))
  })

  const filteredPayments = payments.filter((payment) => payment.status !== 'processed')

  const orderDisplayLookup = React.useMemo(() => {
    const lookup = new Map()
    for (const order of orders) {
      lookup.set(String(order.id), order.display_order_id || String(order.id).slice(0, 8))
    }
    return lookup
  }, [orders])

  const displayOrderIdForPayment = (orderId) => orderDisplayLookup.get(String(orderId)) || String(orderId).slice(0, 8)



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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
              {['reports','orders','payments','categories','menu','promotions','reservations'].map((tabName) => (
                <button key={tabName} onClick={() => setTab(tabName)} style={{
                  background: tab === tabName ? 'linear-gradient(135deg, #d4a373 0%, #c9934d 100%)' : 'transparent',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: 10,
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
            {tab === 'reports' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>📊 Reports</h3>
                  {!reports ? (
                    <p style={{ color: '#64748b' }}>No report data</p>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                        <div style={{ padding: 16, background: '#fff7ed', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#92400e' }}>Total Orders</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{reports.total_orders}</div>
                        </div>
                        <div style={{ padding: 16, background: '#eef2ff', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#3730a3' }}>Total Payments</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{reports.total_payments}</div>
                        </div>
                        <div style={{ padding: 16, background: '#ecfdf5', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#065f46' }}>Processed Payments</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{reports.processed_payments}</div>
                        </div>
                        <div style={{ padding: 16, background: '#fff1f2', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#831843' }}>Pending Payments</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{reports.pending_payments}</div>
                        </div>
                        <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#065f46' }}>Revenue</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatMWK(reports.revenue_cents || 0)}</div>
                        </div>
                        <div style={{ padding: 16, background: '#e0f2fe', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#0369a1' }}>Avg Order Value</div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatMWK(reports.average_order_value_cents || 0)}</div>
                        </div>
                        <div style={{ padding: 16, background: '#eef2ff', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#3730a3' }}>Best Sales Day</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{reports.best_sales_day?.date || '-'}</div>
                          <div style={{ fontSize: '0.95rem', color: '#475569' }}>{formatMWK(reports.best_sales_day?.revenue_cents || 0)} revenue</div>
                        </div>
                        <div style={{ padding: 16, background: '#f8fafc', borderRadius: 12 }}>
                          <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>Most Orders Day</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>{reports.most_orders_day?.date || '-'}</div>
                          <div style={{ fontSize: '0.95rem', color: '#475569' }}>{reports.most_orders_day?.orders || 0} orders</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 24, display: 'grid', gap: 20 }}>
                        <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, boxShadow: '0 4px 12px rgba(15,23,42,0.05)' }}>
                          <h4 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>💳 Payment Methods</h4>
                          {Object.keys(reports.payment_methods || {}).length === 0 ? (
                            <p style={{ color: '#64748b', margin: 0 }}>No payment method data available.</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', padding: '10px', color: '#0f172a', fontWeight: 700 }}>Method</th>
                                  <th style={{ textAlign: 'right', padding: '10px', color: '#0f172a', fontWeight: 700 }}>Count</th>
                                  <th style={{ textAlign: 'right', padding: '10px', color: '#0f172a', fontWeight: 700 }}>Revenue</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(reports.payment_methods || {}).map(([method, stats]) => (
                                  <tr key={method} style={{ borderTop: '1px solid rgba(226,232,240,0.8)' }}>
                                    <td style={{ padding: '10px', color: '#0f172a' }}>{method}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#334155' }}>{stats.count}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a' }}>{formatMWK(stats.revenue_cents || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, boxShadow: '0 4px 12px rgba(15,23,42,0.05)' }}>
                          <h4 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>📈 Sales by Day</h4>
                          {reports.sales_by_day?.length === 0 ? (
                            <p style={{ color: '#64748b', margin: 0 }}>No daily sales data yet.</p>
                          ) : (
                            <>
                              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, overflowX: 'auto', padding: '8px 0' }}>
                                  {(() => {
                                    const maxRevenue = Math.max(...reports.sales_by_day.map((d) => d.revenue_cents || 0), 1)
                                    return reports.sales_by_day.map((day) => {
                                      const barHeight = Math.max(36, ((day.revenue_cents || 0) / maxRevenue) * 160)
                                      return (
                                        <div key={day.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                                          <div style={{ width: '100%', height: `${barHeight}px`, background: '#d4a373', borderRadius: '14px 14px 0 0', transition: 'height 0.2s ease' }} />
                                          <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#475569', textAlign: 'center' }}>{day.date}</div>
                                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>{formatMWK(day.revenue_cents || 0)}</div>
                                        </div>
                                      )
                                    })
                                  })()}
                                </div>
                              </div>
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ padding: '10px', textAlign: 'left', color: '#0f172a', fontWeight: 700 }}>Date</th>
                                      <th style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>Orders</th>
                                      <th style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>Revenue</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {reports.sales_by_day.map((day) => (
                                      <tr key={day.date} style={{ borderTop: '1px solid rgba(226,232,240,0.8)' }}>
                                        <td style={{ padding: '10px', color: '#0f172a' }}>{day.date}</td>
                                        <td style={{ padding: '10px', textAlign: 'right', color: '#334155' }}>{day.orders}</td>
                                        <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a' }}>{formatMWK(day.revenue_cents || 0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, boxShadow: '0 4px 12px rgba(15,23,42,0.05)' }}>
                          <h4 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>🛍️ Top Selling Items</h4>
                          {reports.top_selling_items?.length === 0 ? (
                            <p style={{ color: '#64748b', margin: 0 }}>No item sales data available yet.</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                              <thead>
                                <tr>
                                  <th style={{ padding: '10px', textAlign: 'left', color: '#0f172a', fontWeight: 700 }}>Item</th>
                                  <th style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>Qty</th>
                                  <th style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>Revenue</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reports.top_selling_items.map((item) => (
                                  <tr key={item.menu_item_id} style={{ borderTop: '1px solid rgba(226,232,240,0.8)' }}>
                                    <td style={{ padding: '10px', color: '#0f172a' }}>{item.name}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#334155' }}>{item.quantity}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a' }}>{formatMWK(item.revenue_cents || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        <div style={{ background: '#ffffff', borderRadius: 16, padding: 20, boxShadow: '0 4px 12px rgba(15,23,42,0.05)' }}>
                          <h4 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>📦 Order Status Breakdown</h4>
                          {Object.keys(reports.order_status_counts || {}).length === 0 ? (
                            <p style={{ color: '#64748b', margin: 0 }}>No status breakdown available.</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                              <thead>
                                <tr>
                                  <th style={{ padding: '10px', textAlign: 'left', color: '#0f172a', fontWeight: 700 }}>Status</th>
                                  <th style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(reports.order_status_counts || {}).map(([status, count]) => (
                                  <tr key={status} style={{ borderTop: '1px solid rgba(226,232,240,0.8)' }}>
                                    <td style={{ padding: '10px', color: '#0f172a' }}>{status}</td>
                                    <td style={{ padding: '10px', textAlign: 'right', color: '#334155' }}>{count}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {tab === 'orders' && (
              <div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15,23,42,0.06)' }}>
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>📦 Recent Orders</h3>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
                    <input
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Search orders by ID, customer, or phone"
                      style={{ flex: '1 1 260px', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(148,163,184,0.3)', fontSize: '0.95rem' }}
                    />
                    <div style={{ color: '#64748b', fontSize: '0.95rem' }}>{filteredOrders.length} orders found</div>
                  </div>
                  {filteredOrders.length === 0 ? (
                    <p style={{ color: '#64748b' }}>No orders matched your search.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '14px' }}>
                      {filteredOrders.map((o) => (
                        <div key={o.id} style={{ border: '1px solid rgba(212,163,115,0.2)', borderRadius: '16px', overflow: 'hidden', background: 'white' }}>
                          <div
                            onClick={() => toggleOrderExpanded(o.id)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(120px, 1fr) minmax(150px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr)',
                              gap: '12px',
                              padding: '16px',
                              alignItems: 'center',
                              cursor: 'pointer',
                              background: expandedOrderId === o.id ? 'rgba(212,163,115,0.08)' : '#f8fafc',
                              transition: 'background 0.2s ease'
                            }}
                            onMouseEnter={(e) => { if (expandedOrderId !== o.id) e.currentTarget.style.background = 'rgba(212,163,115,0.12)' }}
                            onMouseLeave={(e) => { if (expandedOrderId !== o.id) e.currentTarget.style.background = '#f8fafc' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '1rem', color: '#d4a373' }}>{expandedOrderId === o.id ? '▼' : '▶'}</span>
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>#{o.display_order_id || o.id.slice(0, 8)}</div>
                                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{new Date(o.created_at).toLocaleString()}</div>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Customer</div>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{o.customer_name}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Phone</div>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{o.customer_phone || '-'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Total</div>
                              <div style={{ fontWeight: 700, color: '#10b981' }}>{formatMWK(o.total_cents)}</div>
                            </div>
                              <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Status</div>
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
                            </div>
                          </div>

                          {expandedOrderId === o.id && (
                            <div style={{ padding: '18px 20px', background: '#fdf7ec', borderTop: '1px solid rgba(212,163,115,0.2)' }}>
                              <div style={{ marginBottom: '14px', fontWeight: 700, color: '#0f172a' }}>🛒 Items Ordered</div>
                              <div style={{ display: 'grid', gap: '12px' }}>
                                {o.items.map((item, idx) => {
                                  const prefs = item.customizations?.preferences || {}
                                  const itemName = item.menu_item_name || menuItems.find((mi) => mi.id === item.menu_item_id)?.name || item.menu_item_id || 'Unknown item'
                                  const prefList = Object.entries(prefs)
                                    .filter(([, value]) => value)
                                    .map(([key]) => {
                                      if (key === 'spicy') return 'Spicy'
                                      if (key === 'noOnions') return 'No Onions'
                                      if (key === 'extraCheese') return 'Extra Cheese'
                                      if (key === 'glutenFree') return 'Gluten Free'
                                      return key
                                    })
                                  return (
                                    <div key={idx} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(212,163,115,0.12)', padding: '14px', display: 'grid', gap: '6px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{itemName}</div>
                                        <div style={{ fontWeight: 700, color: '#10b981' }}>{formatMWK(item.unit_price_cents || 0)} each</div>
                                      </div>
                                      <div style={{ color: '#475569' }}>Quantity: {item.qty}</div>
                                      {prefList.length > 0 && <div style={{ color: '#64748b' }}>Preferences: {prefList.join(', ')}</div>}
                                      {item.customizations?.customIngredients && <div style={{ color: '#64748b' }}>Custom: {item.customizations.customIngredients}</div>}
                                      {item.customizations?.pickupTime && <div style={{ color: '#64748b' }}>Pickup: {new Date(item.customizations.pickupTime).toLocaleString()}</div>}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
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
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '18px' }}>
                    <div style={{ color: '#64748b', fontSize: '0.95rem' }}>{filteredPayments.length} payments</div>
                  </div>
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
                          {filteredPayments.map((p) => (
                            <tr key={p.id}>
                              <td style={{ padding: '12px', fontWeight: 700, color: '#d4a373' }}>#{displayOrderIdForPayment(p.order_id)}</td>
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