import { describe, expect, it } from 'vitest'
import { homeScreenAdviceFor } from './homeScreen'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

describe('homeScreenAdviceFor', () => {
  it('advises a phone browser, in the words of its own system', () => {
    expect(homeScreenAdviceFor({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false })).toBe('ios')
    expect(homeScreenAdviceFor({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false })).toBe('android')
  })

  it('advises an iPad that asks for the desktop site, which says it is a Mac but has a touch screen', () => {
    expect(homeScreenAdviceFor({ userAgent: MAC, maxTouchPoints: 5, standalone: false })).toBe('ios')
  })

  it('says nothing in the installed app, whatever the device', () => {
    expect(homeScreenAdviceFor({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBeNull()
    expect(homeScreenAdviceFor({ userAgent: ANDROID, maxTouchPoints: 5, standalone: true })).toBeNull()
  })

  it('says nothing on a computer', () => {
    expect(homeScreenAdviceFor({ userAgent: MAC, maxTouchPoints: 0, standalone: false })).toBeNull()
    expect(homeScreenAdviceFor({ userAgent: WINDOWS, maxTouchPoints: 0, standalone: false })).toBeNull()
  })
})
