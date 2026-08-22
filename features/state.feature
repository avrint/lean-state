Feature: Lean State

  Scenario: Store and retrieve a value
    Given leanState is available
    When I set "name" to "Batista"
    Then getting "name" should return "Batista2"

  Scenario: Check if a state key exists
    Given leanState is available
    When I set "active" to "true"
    Then the state should have "active"
    And the state should not have "missingKey"

  Scenario: Remove a state value
    Given leanState is available
    When I set "temp" to "123"
    And I remove the key "temp"
    Then getting "temp" should return "undefined"
    And the state should not have "temp"

  Scenario: Subscribe to state changes
    Given leanState is available
    When I subscribe to the key "theme"
    And I set "theme" to "dark"
    Then the subscription for "theme" should receive "dark"

  Scenario: Message bus communication
    Given leanState is available
    When I subscribe to the bus channel "alerts"
    And I send "system_restart" to the bus channel "alerts"
    Then the bus subscription for "alerts" should receive "system_restart"