/**
 * Prisma Session Store for Express Session
 * Implements express-session store interface using Prisma
 */

import { PrismaClient } from '@prisma/client'
import { Store } from 'express-session'

const prisma = new PrismaClient()

export class PrismaSessionStore extends Store {
  constructor(options = {}) {
    super(options)
    this.prisma = prisma
    this.prefix = options.prefix || 'sess:'
    this.ttl = options.ttl || 86400 // 24 hours in seconds
  }

  /**
   * Get session by ID
   */
  async get(sid, callback) {
    try {
      const session = await this.prisma.expressSession.findUnique({
        where: { sid: this.prefix + sid }
      })

      if (!session) {
        return callback(null, null)
      }

      // Check if expired
      if (session.expire < new Date()) {
        await this.destroy(sid, () => {})
        return callback(null, null)
      }

      // Return session data
      callback(null, session.sess)
    } catch (error) {
      console.error('Prisma session get error:', error)
      callback(error)
    }
  }

  /**
   * Set/update session
   */
  async set(sid, session, callback) {
    try {
      const maxAge = session.cookie?.maxAge || this.ttl * 1000
      const expire = new Date(Date.now() + maxAge)

      await this.prisma.expressSession.upsert({
        where: { sid: this.prefix + sid },
        update: {
          sess: session,
          expire: expire,
          updatedAt: new Date()
        },
        create: {
          sid: this.prefix + sid,
          sess: session,
          expire: expire
        }
      })

      callback(null)
    } catch (error) {
      console.error('Prisma session set error:', error)
      callback(error)
    }
  }

  /**
   * Destroy session
   */
  async destroy(sid, callback) {
    try {
      await this.prisma.expressSession.delete({
        where: { sid: this.prefix + sid }
      }).catch(() => {
        // Ignore if session doesn't exist
      })

      callback(null)
    } catch (error) {
      console.error('Prisma session destroy error:', error)
      callback(error)
    }
  }

  /**
   * Touch session (update expiration)
   */
  async touch(sid, session, callback) {
    try {
      const maxAge = session.cookie?.maxAge || this.ttl * 1000
      const expire = new Date(Date.now() + maxAge)

      await this.prisma.expressSession.update({
        where: { sid: this.prefix + sid },
        data: {
          expire: expire,
          updatedAt: new Date()
        }
      }).catch(() => {
        // If session doesn't exist, create it
        return this.set(sid, session, callback)
      })

      callback(null)
    } catch (error) {
      console.error('Prisma session touch error:', error)
      callback(error)
    }
  }

  /**
   * Get all sessions (optional, for admin purposes)
   */
  async all(callback) {
    try {
      const sessions = await this.prisma.expressSession.findMany({
        where: {
          expire: { gte: new Date() }
        }
      })

      const sessionMap = {}
      sessions.forEach(s => {
        sessionMap[s.sid.replace(this.prefix, '')] = s.sess
      })

      callback(null, sessionMap)
    } catch (error) {
      console.error('Prisma session all error:', error)
      callback(error)
    }
  }

  /**
   * Get session count
   */
  async length(callback) {
    try {
      const count = await this.prisma.expressSession.count({
        where: {
          expire: { gte: new Date() }
        }
      })

      callback(null, count)
    } catch (error) {
      console.error('Prisma session length error:', error)
      callback(error)
    }
  }

  /**
   * Clear all sessions
   */
  async clear(callback) {
    try {
      await this.prisma.expressSession.deleteMany({})
      callback(null)
    } catch (error) {
      console.error('Prisma session clear error:', error)
      callback(error)
    }
  }

  /**
   * Cleanup expired sessions (call periodically)
   */
  async cleanup() {
    try {
      const result = await this.prisma.expressSession.deleteMany({
        where: {
          expire: { lt: new Date() }
        }
      })

      return result.count
    } catch (error) {
      console.error('Prisma session cleanup error:', error)
      return 0
    }
  }
}
