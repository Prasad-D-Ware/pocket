import { TextInput, type TextInputProps, Text, View } from 'react-native'

export type TextFieldProps = TextInputProps & {
  label?: string
  helper?: string
  error?: string
}

export function TextField({
  label,
  helper,
  error,
  multiline,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <View className="mb-3">
      {label && (
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-1.5 font-semibold">
          {label}
        </Text>
      )}
      <TextInput
        {...inputProps}
        multiline={multiline}
        placeholderTextColor="#71717A"
        accessibilityLabel={label}
        accessibilityHint={helper}
        className={`bg-[#14141C] border border-white/[0.08] rounded-xl px-3 py-3 text-white text-base ${multiline ? 'min-h-[80px]' : ''} ${error ? 'border-red-500' : ''} ${className ?? ''}`}
      />
      {(helper || error) && (
        <Text
          className={`text-xs mt-1.5 ${error ? 'text-red-400' : 'text-gray-500'}`}
        >
          {error ?? helper}
        </Text>
      )}
    </View>
  )
}
