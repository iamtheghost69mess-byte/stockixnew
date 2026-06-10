import React from 'react';
import { Box, Stack } from '@/components';
import { Tab, TabProps, Tabs } from '@blueprintjs/core';
import { ElementCustomizeHeader } from './ElementCustomizeHeader';
import {
  ElementCustomizeTabsEnum,
  useElementCustomizeTabsController,
} from './ElementCustomizeTabsController';
import { useElementCustomizeContext } from './ElementCustomizeProvider';
import styles from './ElementCustomizeTabs.module.scss';

interface ElementCustomizeTabItem {
  id: string;
  label: string;
  tabProps?: TabProps;
}

export function ElementCustomizeTabs() {
  const { setCurrentTabId } = useElementCustomizeTabsController();
  const { CustomizeTabs } = useElementCustomizeContext();

  const tabItems = React.Children.map(CustomizeTabs, (node) => {
    if (!React.isValidElement(node)) {
      return null;
    }
    return node.props as ElementCustomizeTabItem;
  })?.filter((item): item is ElementCustomizeTabItem => item != null);
  const handleChange = (value: ElementCustomizeTabsEnum) => {
    setCurrentTabId(value);
  };
  return (
    <Stack spacing={0} className={styles.root}>
      <ElementCustomizeHeader label={''} />

      <Box className={styles.content}>
        <Tabs
          vertical
          fill
          large
          onChange={handleChange}
          className={styles.tabsList}
        >
          {tabItems?.map(({ id, label, tabProps }) => (
            <Tab id={id} key={id} title={label} {...tabProps} />
          ))}
        </Tabs>
      </Box>
    </Stack>
  );
}
