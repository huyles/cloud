import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AuthButton from './AuthButton'

const Header = () => {
  const [cartCount, setCartCount] = useState(0)

  useEffect(() => {
    const updateCartCount = () => {
      const savedCart = localStorage.getItem('flashdrop-cart')
      if (savedCart) {
        try {
          const items = JSON.parse(savedCart)
          const totalItems = items.reduce((sum: number, item: any) => sum + item.quantity, 0)
          setCartCount(totalItems)
        } catch (error) {
          setCartCount(0)
        }
      } else {
        setCartCount(0)
      }
    }

    updateCartCount()
    window.addEventListener('storage', updateCartCount)
    window.addEventListener('cartUpdated', updateCartCount)

    return () => {
      window.removeEventListener('storage', updateCartCount)
      window.removeEventListener('cartUpdated', updateCartCount)
    }
  }, [])

  return (
    <header className="header">
      <div className="container">
        <nav className="nav">
          <Link to="/" className="logo">
            FlashDrop
          </Link>
          <ul className="nav-links">
            <li><Link to="/">Home</Link></li>
            <li>
              <Link to="/cart" style={{ position: 'relative' }}>
                Cart
                {cartCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    background: '#ff6b6b',
                    color: 'white',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold'
                  }}>
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
            </li>
            <li>
              <AuthButton />
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}

export default Header
