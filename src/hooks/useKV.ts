import { useState, useEffect } from 'react'

/**
 * Custom hook to replace GitHub Spark's useKV hook
 * Provides simple key-value storage using localStorage
 */
export function useKV<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setValueAndStore = (newValue: T) => {
    try {
      setValue(newValue)
      localStorage.setItem(key, JSON.stringify(newValue))
    } catch (error) {
      console.error(`Failed to store value for key ${key}:`, error)
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error(`Failed to store value for key ${key}:`, error)
    }
  }, [key, value])

  return [value, setValueAndStore] as const
}

export default useKV