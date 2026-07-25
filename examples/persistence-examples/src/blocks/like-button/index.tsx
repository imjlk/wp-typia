import {
  registerScaffoldBlockType,
  type BlockConfiguration,
} from '@wp-typia/block-types/blocks/registration';
import {
  buildScaffoldBlockRegistration,
  parseScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';

import Edit from './edit';
import Save from './save';
import metadata from './block.json';
import './style.scss';

import type { PersistenceLikeButtonAttributes } from './types';

const registration = buildScaffoldBlockRegistration(
  parseScaffoldBlockMetadata<
		BlockConfiguration< PersistenceLikeButtonAttributes >
	>(metadata),
  {
    edit: Edit,
    save: Save,
  },
);

registerScaffoldBlockType( registration.name, registration.settings );
