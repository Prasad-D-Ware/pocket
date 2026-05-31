import { TextInput, type TextInputProps, Text, View } from 'react-native'
import { COLORS, RADIUS } from './tokens'

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
  style,
  ...inputProps
}: TextFieldProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label && (
        <Text className="text-xs uppercase tracking-wider text-gray-400 mb-1.5 font-semibold">
          {label}
        </Text>
      )}
      <TextInput
        {...inputProps}
        multiline={multiline}
        placeholderTextColor={COLORS.textFaint}
        accessibilityLabel={label}
        accessibilityHint={helper}
        style={[
          {
            backgroundColor: COLORS.surface,
            borderWidth: 1,
            borderColor: error ? COLORS.negative : 'rgba(255,255,255,0.08)',
            borderRadius: RADIUS.control,
            paddingHorizontal: 12,
            paddingVertical: 12,
            color: COLORS.text,
            fontSize: 16,
            minHeight: multiline ? 80 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
        ]}
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
