import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'

export default function Reservation() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [guests, setGuests] = useState(2)
  const [timeSlot, setTimeSlot] = useState('')
  const [newsletter, setNewsletter] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const body = {
        name,
        email,
        phone,
        guests: parseInt(guests || 1, 10),
        time_slot: timeSlot,
        newsletter
      }
      const res = await apiFetch('reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Reservation failed' })
      } else {
        setMessage({ type: 'success', text: `Reservation confirmed — Table ${data.table_number} at ${new Date(data.time_slot).toLocaleString()}. To confirm your reservation, please order at least one menu item.` })
        // clear form
        setName('')
        setEmail('')
        setPhone('')
        setGuests(2)
        setTimeSlot('')
        setNewsletter(false)
      }
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Network error; try again' })
    }
    setLoading(false)
  }

  return (
    <div className="reservation-page">
      <section className="page-hero reservation-hero">
        <div>
          <span className="eyebrow">Book with us</span>
          <h2>Reserve your table</h2>
          <p>Pick a time, choose your party size, and enjoy a relaxed dining experience at Café Fausse.</p>
        </div>
      </section>

      <div className="form-card">
        <h3>Reservation details</h3>
        <form onSubmit={submit}>
          <div className="form-row">
            <label>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-row">
            <label>Phone (optional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-row grid-two">
            <div>
              <label>Number of guests</label>
              <input type="number" min="1" max="20" value={guests} onChange={(e) => setGuests(e.target.value)} />
            </div>
            <div>
              <label>Time slot *</label>
              <input type="datetime-local" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} required />
            </div>
          </div>
          <div className="form-row checkbox-row">
            <label>
              <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
              &nbsp;Subscribe to newsletter
            </label>
          </div>
          <div className="form-row">
            <button type="submit" disabled={loading}>{loading ? 'Booking…' : 'Reserve'}</button>
          </div>
        </form>

        {message && (
          <div className={`msg ${message.type === 'error' ? 'error' : 'success'}`}>
            {message.text}
            {message.type === 'success' && (
              <div style={{ marginTop: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => navigate('/menu')}
                  style={{ padding: '8px 16px', background: '#c8102e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Go to Order Page
                </button>
              </div>
            )}
          </div>
        )}

        <div className="note-card">
          <h4>Notes</h4>
          <p>We have 30 tables. If a chosen time slot is fully booked, we’ll ask you to choose another time.</p>
        </div>
      </div>
    </div>
  )
}
