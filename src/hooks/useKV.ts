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

  const setValueAndStore = (valueOrUpdater: T | ((previousValue: T) => T)) => {
    setValue(prevValue => {
      const newValue =
        typeof valueOrUpdater === 'function'
          ? (valueOrUpdater as (previousValue: T) => T)(prevValue)
          : valueOrUpdater

      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch (error) {
        console.error(`Failed to store value for key ${key}:`, error)
      }

      return newValue
    })
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