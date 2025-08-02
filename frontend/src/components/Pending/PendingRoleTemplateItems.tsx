import React from "react"
import { Table } from "@chakra-ui/react"

import { SkeletonText } from "../ui/skeleton"

const PendingRoleTemplateItems = () => {
  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>ID</Table.ColumnHeader>
          <Table.ColumnHeader>条目名称</Table.ColumnHeader>
          <Table.ColumnHeader>所属模板</Table.ColumnHeader>
          <Table.ColumnHeader>提示词描述</Table.ColumnHeader>
          <Table.ColumnHeader>创建时间</Table.ColumnHeader>
          <Table.ColumnHeader>操作</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {Array.from({ length: 5 }).map((_, index) => (
          <Table.Row key={index}>
            <Table.Cell>
              <SkeletonText noOfLines={1} />
            </Table.Cell>
            <Table.Cell>
              <SkeletonText noOfLines={1} />
            </Table.Cell>
            <Table.Cell>
              <SkeletonText noOfLines={1} />
            </Table.Cell>
            <Table.Cell>
              <SkeletonText noOfLines={1} />
            </Table.Cell>
            <Table.Cell>
              <SkeletonText noOfLines={1} />
            </Table.Cell>
            <Table.Cell>
              <SkeletonText noOfLines={1} />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}

export default PendingRoleTemplateItems 