import React from 'react';
import { View, type TextInputProps } from 'react-native';
import AppTextInput from './AppTextInput';

export interface AddressParts {
  street: string;
  city: string;
  state: string;
  zip: string;
  displayName: string;
  lat: string;
  lon: string;
}

interface Props extends Omit<TextInputProps, 'onChangeText' | 'style'> {
  value: string;
  onChangeText: (text: string) => void;
  onSelectAddress?: (parts: AddressParts) => void;
  onDropdownHeightChange?: (height: number) => void;
  inputStyle?: any;
  containerStyle?: any;
  rowStyle?: any;
  rightElement?: React.ReactNode;
  opensUpward?: boolean;
}

/** Local-only input. Typing never sends address data to a web service. */
export default function AddressAutocompleteInput({
  value,
  onChangeText,
  inputStyle,
  containerStyle,
  rowStyle,
  rightElement,
  onDropdownHeightChange,
  onSelectAddress: _onSelectAddress,
  opensUpward: _opensUpward,
  ...rest
}: Props) {
  React.useEffect(() => onDropdownHeightChange?.(0), [onDropdownHeightChange]);
  return (
    <View style={containerStyle}>
      <View style={[{ flexDirection: 'row', alignItems: 'center' }, rowStyle]}>
        <AppTextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
          style={[{ flex: 1 }, inputStyle]}
        />
        {rightElement}
      </View>
    </View>
  );
}
