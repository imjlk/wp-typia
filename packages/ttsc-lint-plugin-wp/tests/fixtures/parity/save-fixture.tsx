// Every translation call in a save.* script variant is reported, even
// outside an explicit save function.
const save = () => __('Save file render', 'my-plugin');
const notSaveHere = () => __('Save file helper', 'my-plugin');
