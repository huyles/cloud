import React, { useState, useEffect } from 'react'
import { formatTimeRemaining } from '../data/products'

interface FlashSaleTimerProps {
  endTime: string
  onExpire?: () => void
  compact?: boolean // New prop for compact display
}

const FlashSaleTimer: React.FC<FlashSaleTimerProps> = ({ endTime, onExpire, compact = false }) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date().getTime()
      const end = new Date(endTime).getTime()
      const remaining = end - now
      
      if (remaining <= 0) {
        setTimeRemaining(0)
        if (onExpire) onExpire()
        return
      }
      
      setTimeRemaining(remaining)
    }

    calculateTimeRemaining()
    const interval = setInterval(calculateTimeRemaining, 1000)

    return () => clearInterval(interval)
  }, [endTime, onExpire])

  if (timeRemaining <= 0) {
    return (
      <span className="flash-sale-timer-expired">
        {compact ? "Ended" : "🚫 Flash sale ended"}
      </span>
    )
  }

  if (compact) {
    return (
      <span className="timer-value-only">
        Ends in {formatTimeRemaining(timeRemaining)}
      </span>
    )
  }

  return (
    <div className="flash-sale-timer">
      <span className="timer-label">⏰ Ends in:</span>
      <span className="timer-value">{formatTimeRemaining(timeRemaining)}</span>
    </div>
  )
}

export default FlashSaleTimer
