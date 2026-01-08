import React, { useState, useEffect } from 'react'
import { FlashSale, getFlashSaleStatus, formatTimeRemaining } from '../data/products'

interface FlashSaleTimerProps {
  flashSale: FlashSale
  onStatusChange?: (status: string) => void
}

export const FlashSaleTimer: React.FC<FlashSaleTimerProps> = ({ 
  flashSale, 
  onStatusChange 
}) => {
  const [status, setStatus] = useState(getFlashSaleStatus(flashSale))
  
  useEffect(() => {
    const interval = setInterval(() => {
      const newStatus = getFlashSaleStatus(flashSale)
      setStatus(newStatus)
      
      if (onStatusChange) {
        onStatusChange(newStatus.status)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [flashSale, onStatusChange])
  
  if (status.status === 'none' || status.status === 'ended') return null
  
  // Compact inline display
  return (
    <div style={{ 
      fontSize: '0.85rem', 
      fontWeight: '600',
      marginBottom: '0.5rem'
    }}>
      {status.status === 'upcoming' && status.timeUntilStart && (
        <div style={{ color: '#2563eb' }}>
          ⏰ Sale starts in {formatTimeRemaining(status.timeUntilStart)}
        </div>
      )}
      
      {status.status === 'active' && (
        <div style={{ color: '#dc2626' }}>
          <div>🔥 Ends in {status.timeUntilEnd ? formatTimeRemaining(status.timeUntilEnd) : 'soon'}</div>
          {status.remaining && (
            <div style={{ fontSize: '0.8rem', color: '#7c2d12', marginTop: '0.2rem' }}>
              Only {status.remaining} left!
            </div>
          )}
        </div>
      )}
      
      {status.status === 'sold_out' && (
        <div style={{ color: '#dc2626', fontWeight: 'bold' }}>
          🚫 Flash sale sold out
        </div>
      )}
    </div>
  )
}

export default FlashSaleTimer