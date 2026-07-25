import { useBlockProps } from '@wordpress/block-editor';

export default function Save( { attributes }: { attributes: any } ) {
  useBlockProps.save();
  void attributes;
  return null;
}
