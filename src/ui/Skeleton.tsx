import { useEffect, useRef } from 'react'
import { Animated, View } from 'react-native'

export type SkeletonProps = {
  width?: number | string
  height?: number
  radius?: number
}

export function Skeleton({ width = '100%', height = 16, radius = 6 }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{
        width: width as number,
        height,
        borderRadius: radius,
        backgroundColor: 'rgba(255,255,255,0.08)',
        opacity,
      }}
    />
  )
}
