import { Badge, Flex, Icon, Text } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import {
  FiBriefcase,
  FiClipboard,
  FiHome,
  FiLayers,
  FiList,
  FiMessageSquare,
  FiSettings,
  FiUsers,
  FiZap,
} from "react-icons/fi"

import type { UserPublic } from "@/client"

const items = [
  { icon: FiHome, title: "首页", path: "/" },
  { icon: FiBriefcase, title: "项目", path: "/items" },
  { icon: FiSettings, title: "设置", path: "/settings" },
]

interface SidebarItemsProps {
  onClose?: () => void
}

const SidebarItems = ({ onClose }: SidebarItemsProps) => {
  const listItems = items.map(({ icon, title, path }) => (
    <Link key={title} to={path} style={{ textDecoration: "none" }}>
      <Flex
        align="center"
        p="4"
        mx="4"
        borderRadius="lg"
        role="group"
        cursor="pointer"
        color="inherit"
        _hover={{
          bg: "gray.100",
          color: "gray.900",
        }}
        onClick={onClose}
      >
        <Icon
          mr="4"
          fontSize="16"
          _groupHover={{
            color: "gray.600",
          }}
          as={icon}
        />
        <Text fontWeight="medium">{title}</Text>
      </Flex>
    </Link>
  ))

  return <>{listItems}</>
}

// 超级用户专享功能
const AdminItems = ({ onClose }: SidebarItemsProps) => {
  const adminItems = [
    { icon: FiUsers, title: "用户管理", path: "/admin" },
    { icon: FiList, title: "角色分类", path: "/role-dirs" },
    { icon: FiLayers, title: "角色管理", path: "/roles" },
    { icon: FiList, title: "角色模板", path: "/role-templates" },
    { icon: FiList, title: "模板条目", path: "/role-template-items" },
    { icon: FiMessageSquare, title: "角色提示词", path: "/role-prompts" },
    { icon: FiClipboard, title: "任务管理", path: "/task-creat-role-prompts" },
    { icon: FiZap, title: "批量生成", path: "/prompt-generator" },
  ]

  const adminListItems = adminItems.map(({ icon, title, path }) => (
    <Link key={title} to={path} style={{ textDecoration: "none" }}>
      <Flex
        align="center"
        p="4"
        mx="4"
        borderRadius="lg"
        role="group"
        cursor="pointer"
        color="inherit"
        _hover={{
          bg: "gray.100",
          color: "gray.900",
        }}
        onClick={onClose}
      >
        <Icon
          mr="4"
          fontSize="16"
          _groupHover={{
            color: "gray.600",
          }}
          as={icon}
        />
        <Text fontWeight="medium">{title}</Text>
      </Flex>
    </Link>
  ))

  return (
    <>
      <Text
        fontSize="xs"
        fontWeight="bold"
        color="gray.400"
        letterSpacing="wide"
        mb={2}
        px={4}
      >
        管理功能
      </Text>
      {adminListItems}
    </>
  )
}

interface UserMenuProps {
  user?: UserPublic | null
  onClose?: () => void
}

const UserMenu = ({ user, onClose }: UserMenuProps) => {
  const finalItems = [
    ...items,
    ...(user?.is_superuser
      ? [
          { icon: FiUsers, title: "用户管理", path: "/admin" },
          { icon: FiList, title: "角色分类", path: "/role-dirs" },
          { icon: FiLayers, title: "角色管理", path: "/roles" },
          { icon: FiList, title: "角色模板", path: "/role-templates" },
          { icon: FiList, title: "模板条目", path: "/role-template-items" },
          { icon: FiMessageSquare, title: "角色提示词", path: "/role-prompts" },
          {
            icon: FiClipboard,
            title: "任务管理",
            path: "/task-creat-role-prompts",
          },
        ]
      : []),
  ]

  const listItems = finalItems.map(({ icon, title, path }) => (
    <Link key={title} to={path} style={{ textDecoration: "none" }}>
      <Flex
        align="center"
        p="4"
        mx="4"
        borderRadius="lg"
        role="group"
        cursor="pointer"
        color="inherit"
        _hover={{
          bg: "gray.100",
          color: "gray.900",
        }}
        onClick={onClose}
      >
        <Icon
          mr="4"
          fontSize="16"
          _groupHover={{
            color: "gray.600",
          }}
          as={icon}
        />
        <Text fontWeight="medium">{title}</Text>
        {(path === "/admin" ||
          path.startsWith("/role") ||
          path.startsWith("/task")) &&
          user?.is_superuser && (
            <Badge ml="auto" size="sm" colorScheme="blue">
              管理
            </Badge>
          )}
      </Flex>
    </Link>
  ))

  return <>{listItems}</>
}

export { AdminItems, SidebarItems, UserMenu }
