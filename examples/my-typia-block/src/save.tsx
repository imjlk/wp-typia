import { useBlockProps } from '@wordpress/block-editor';
import { MyTypiaBlockAttributes } from './types';

interface SaveProps {
  attributes: MyTypiaBlockAttributes;
}

export default function Save( { attributes }: SaveProps ) {
  useBlockProps.save();
  void attributes;
  return null;
}
