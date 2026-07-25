import {
  registerScaffoldBlockType,
  type BlockConfiguration,
} from '@wp-typia/block-types/blocks/registration';
import {
  buildScaffoldBlockRegistration,
  parseScaffoldBlockMetadata,
} from '@wp-typia/block-runtime/blocks';
import metadata from './block-metadata';
import { deprecated } from './deprecated';
import Edit from './edit';
import Save from './save';
import { MyTypiaBlockAttributes } from './types';
import { validators } from './validators';
import './style.scss';

const registration = buildScaffoldBlockRegistration(
  parseScaffoldBlockMetadata< BlockConfiguration< MyTypiaBlockAttributes > >(
    metadata,
  ),
  {
    example: {
      attributes: validators.random(),
    },
    deprecated,
    edit: Edit,
    save: Save,
  },
);

const registeredBlock = registerScaffoldBlockType(
  registration.name,
  registration.settings,
);

void registeredBlock;
